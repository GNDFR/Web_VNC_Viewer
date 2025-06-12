// main.go
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

// VNC 프로토콜 상수 (RFC 6143 일부 발췌)
const (
	VNCProtocolVersion38 = "RFB 003.008\n"

	SecurityTypeNone = 1 // No authentication
	SecurityTypeVNCAuth = 2 // VNC Authentication (not implemented in this PoC)

	MessageTypeFramebufferUpdate = 0
	MessageTypeBell              = 2
	MessageTypeServerCutText     = 3

	ClientMessageTypeSetPixelFormat       = 0
	ClientMessageTypeSetEncodings         = 2
	ClientMessageTypeFramebufferUpdateRequest = 3
	ClientMessageTypeKeyEvent               = 4
	ClientMessageTypePointerEvent           = 5
	// ClientMessageTypeClientCutText = 6 // Not implemented

	EncodingRaw = 0 // Only Raw encoding supported in this PoC
)

// VNC 픽셀 포맷 구조체
type PixelFormat struct {
	BPP        uint8 // Bits-per-pixel
	Depth      uint8
	BigEndian  uint8 // 0: little-endian, 1: big-endian
	TrueColor  uint8 // 0: colormap, 1: true color
	RedMax     uint16
	GreenMax   uint16
	BlueMax    uint16
	RedShift   uint8
	GreenShift uint8
	BlueShift  uint8
	_          [3]byte // Padding
}

// VNC 서버 초기화 메시지 구조체
type ServerInitMessage struct {
	FramebufferWidth  uint16
	FramebufferHeight uint16
	PixelFormat       PixelFormat
	NameLength        uint32
	Name              string
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 개발 편의를 위해 모든 Origin 허용. 실제 환경에서는 특정 Origin만 허용해야 함.
		return true
	},
}

func main() {
	// 정적 파일 서빙 (HTML, JavaScript)
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// WebSocket VNC 프록시 엔드포인트
	http.HandleFunc("/vnc-proxy", handleVNCProxy)

	// Render 환경에서 PORT 환경 변수를 사용
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // 로컬 개발용 기본 포트
	}

	log.Printf("Go VNC Gateway 서버가 :%s 포트에서 실행 중입니다.\n", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatalf("서버 시작 실패: %v", err)
	}
}

// handleVNCProxy는 WebSocket 연결을 처리하고 VNC 서버와 통신합니다.
func handleVNCProxy(w http.ResponseWriter, r *http.Request) {
	wsConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket 연결 업그레이드 실패:", err)
		return
	}
	defer wsConn.Close()

	log.Println("클라이언트 웹 소켓이 연결되었습니다.")

	vncHost := r.URL.Query().Get("host")
	vncPort := r.URL.Query().Get("port")

	if vncHost == "" || vncPort == "" {
		log.Println("VNC 호스트 또는 포트가 지정되지 않았습니다.")
		wsConn.WriteJSON(map[string]string{"type": "error", "message": "VNC host or port missing."})
		return
	}

	vncAddr := fmt.Sprintf("%s:%s", vncHost, vncPort)
	log.Printf("VNC 서버 연결 시도: %s\n", vncAddr)

	// VNC 서버에 TCP 연결
	vncConn, err := net.Dial("tcp", vncAddr)
	if err != nil {
		log.Printf("VNC 서버 연결 실패 (%s): %v\n", vncAddr, err)
		wsConn.WriteJSON(map[string]string{"type": "error", "message": fmt.Sprintf("Could not connect to VNC server at %s", vncAddr)})
		return
	}
	defer vncConn.Close()

	log.Println("VNC 서버에 연결되었습니다.")

	// --- VNC 프로토콜 핸드셰이크 ---
	if err := performVNCHandshake(vncConn, wsConn); err != nil {
		log.Println("VNC 핸드셰이크 실패:", err)
		wsConn.WriteJSON(map[string]string{"type": "error", "message": fmt.Sprintf("VNC Handshake failed: %v", err)})
		return
	}

	// 데이터 중계를 위한 WaitGroup
	var wg sync.WaitGroup
	wg.Add(2)

	// VNC 서버 -> 웹 소켓 클라이언트 데이터 중계 고루틴
	go func() {
		defer wg.Done()
		defer func() {
			log.Println("VNC 서버 -> 웹 소켓 중계 종료.")
			wsConn.Close() // VNC 서버 연결 종료 시 웹 소켓도 닫음
		}()

		buffer := make([]byte, 4096) // 임시 버퍼
		for {
			// 서버 메시지 타입 읽기 (1바이트)
			var msgType byte
			if _, err := io.ReadFull(vncConn, buffer[:1]); err != nil {
				if err == io.EOF {
					log.Println("VNC 서버 연결 종료 (EOF).")
				} else {
					log.Println("VNC 서버 메시지 타입 읽기 오류:", err)
				}
				return
			}
			msgType = buffer[0]

			switch msgType {
			case MessageTypeFramebufferUpdate:
				// FramebufferUpdate 메시지 헤더 (패딩 1바이트, numRects 2바이트)
				if _, err := io.ReadFull(vncConn, buffer[:3]); err != nil { return } // 패딩, numRects
				numRects := binary.BigEndian.Uint16(buffer[1:3])

				for i := 0; i < int(numRects); i++ {
					// Rectangle 헤더 (x, y, width, height, encodingType)
					if _, err := io.ReadFull(vncConn, buffer[:12]); err != nil { return }
					x := binary.BigEndian.Uint16(buffer[0:2])
					y := binary.BigEndian.Uint16(buffer[2:4])
					width := binary.BigEndian.Uint16(buffer[4:6])
					height := binary.BigEndian.Uint16(buffer[6:8])
					encodingType := int32(binary.BigEndian.Uint32(buffer[8:12]))

					if encodingType == EncodingRaw {
						// Raw 인코딩: 픽셀 데이터는 그냥 연속적으로 따라옴
						// PixelFormat에서 BPP를 알아야 정확한 크기 계산 가능
						// 이 PoC에서는 이전에 받은 serverInitMessage의 PixelFormat 사용
						// 여기서는 간략화를 위해 32bpp (4바이트)로 가정합니다.
						// 실제로는 serverInitMessage.PixelFormat.BPP / 8 로 계산해야 합니다.
						bytesPerPixel := uint8(4) // PoC: 32bpp 가정 (RGBA)
						pixelDataSize := int(width) * int(height) * int(bytesPerPixel)
						pixelData := make([]byte, pixelDataSize)
						if _, err := io.ReadFull(vncConn, pixelData); err != nil {
							log.Println("Raw 픽셀 데이터 읽기 오류:", err)
							return
						}

						// JSON 메시지로 클라이언트에 업데이트 전송
						updateMsg := map[string]interface{}{
							"type":      "framebuffer_update",
							"x":         x,
							"y":         y,
							"width":     width,
							"height":    height,
							"encoding":  "raw",
							"pixelData": pixelData, // Go의 byte[]는 JSON으로 base64 없이 Array로 직렬화될 수 있음
						}
						if err := wsConn.WriteJSON(updateMsg); err != nil {
							log.Println("WebSocket 업데이트 전송 오류:", err)
							return
						}
					} else {
						log.Printf("지원하지 않는 인코딩 타입 (%d) 건너뛰기.", encodingType)
						// 실제 VNC 뷰어는 여기에서 해당 인코딩의 데이터 크기만큼 읽어서 건너뛰어야 합니다.
						// 이 PoC는 단순히 무시하고 다음 업데이트를 기다립니다.
					}
				}
			case MessageTypeBell:
				log.Println("VNC 서버 벨 소리 요청.")
				wsConn.WriteJSON(map[string]string{"type": "bell"})
			case MessageTypeServerCutText:
				// RFC 6143 7.6.3 ServerCutText
				var padding [3]byte
				var length uint32
				if _, err := io.ReadFull(vncConn, padding[:]); err != nil { return }
				if err := binary.Read(vncConn, binary.BigEndian, &length); err != nil { return }
				text := make([]byte, length)
				if _, err := io.ReadFull(vncConn, text); err != nil { return }
				log.Printf("서버 클립보드 텍스트: %s", string(text))
				wsConn.WriteJSON(map[string]string{"type": "server_cut_text", "text": string(text)})
			default:
				log.Printf("알 수 없는 VNC 서버 메시지 타입: %d", msgType)
				// 알 수 없는 메시지 타입은 무시하거나 연결 종료
				return
			}
		}
	}()

	// 웹 소켓 클라이언트 -> VNC 서버 데이터 중계 고루틴
	go func() {
		defer wg.Done()
		defer func() {
			log.Println("웹 소켓 -> VNC 서버 중계 종료.")
			vncConn.Close() // 웹 소켓 연결 종료 시 VNC 서버 연결도 닫음
		}()
		for {
			messageType, p, err := wsConn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					log.Println("클라이언트 웹 소켓 정상 종료.")
				} else {
					log.Println("웹 소켓 읽기 오류:", err)
				}
				return
			}

			if messageType == websocket.TextMessage {
				// JSON 메시지 처리 (예: 프레임버퍼 업데이트 요청)
				var clientMsg map[string]interface{}
				if err := json.Unmarshal(p, &clientMsg); err == nil {
					if clientMsg["type"] == "framebuffer_request" {
						// FramebufferUpdateRequest 메시지 생성 (RFC 6143 7.5.3)
						x := uint16(clientMsg["x"].(float64))
						y := uint16(clientMsg["y"].(float64))
						width := uint16(clientMsg["width"].(float64))
						height := uint16(clientMsg["height"].(float64))
						incremental := clientMsg["incremental"].(bool)

						fbReq := make([]byte, 10)
						fbReq[0] = ClientMessageTypeFramebufferUpdateRequest // MessageType
						if incremental { fbReq[1] = 1 } else { fbReq[1] = 0 } // Incremental
						binary.BigEndian.PutUint16(fbReq[2:4], x)
						binary.BigEndian.PutUint16(fbReq[4:6], y)
						binary.BigEndian.PutUint16(fbReq[6:8], width)
						binary.BigEndian.PutUint16(fbReq[8:10], height)

						if _, err := vncConn.Write(fbReq); err != nil {
							log.Println("프레임버퍼 업데이트 요청 전송 실패:", err)
						}
					} else if clientMsg["type"] == "key_event" {
						// KeyEvent 메시지 생성 (RFC 6143 7.5.4)
						downFlag := clientMsg["down"].(bool)
						key := uint32(clientMsg["keysym"].(float64))

						keyEvent := make([]byte, 8)
						keyEvent[0] = ClientMessageTypeKeyEvent // MessageType
						if downFlag { keyEvent[1] = 1 } else { keyEvent[1] = 0 } // DownFlag
						binary.BigEndian.PutUint16(keyEvent[2:4], 0) // Padding
						binary.BigEndian.PutUint32(keyEvent[4:8], key) // Keysym

						if _, err := vncConn.Write(keyEvent); err != nil {
							log.Println("키 이벤트 전송 실패:", err)
						}
					} else if clientMsg["type"] == "pointer_event" {
						// PointerEvent 메시지 생성 (RFC 6143 7.5.5)
						buttonMask := uint8(clientMsg["buttonMask"].(float64))
						x := uint16(clientMsg["x"].(float64))
						y := uint16(clientMsg["y"].(float64))

						pointerEvent := make([]byte, 6)
						pointerEvent[0] = ClientMessageTypePointerEvent // MessageType
						pointerEvent[1] = buttonMask // ButtonMask
						binary.BigEndian.PutUint16(pointerEvent[2:4], x) // X position
						binary.BigEndian.PutUint16(pointerEvent[4:6], y) // Y position

						if _, err := vncConn.Write(pointerEvent); err != nil {
							log.Println("포인터 이벤트 전송 실패:", err)
						}
					}
					// 다른 클라이언트 메시지 타입 처리 (SetPixelFormat, ClientCutText 등)
				} else {
					log.Printf("JSON 메시지 파싱 오류 또는 알 수 없는 텍스트 메시지: %s", string(p))
				}
			} else {
				log.Printf("알 수 없는 바이너리 메시지 수신 (텍스트 메시지 예상): %v", p)
			}
		}
	}()

	wg.Wait() // 모든 고루틴이 종료될 때까지 대기
	log.Println("모든 중계 고루틴 종료. 연결 닫음.")
}

// performVNCHandshake VNC 프로토콜 핸드셰이크를 수행합니다.
func performVNCHandshake(vncConn net.Conn, wsConn *websocket.Conn) error {
	// 1. 프로토콜 버전 교환 (Server -> Client)
	serverVersions := make([]byte, 12)
	if _, err := io.ReadFull(vncConn, serverVersions); err != nil {
		return fmt.Errorf("VNC 서버 버전 읽기 실패: %w", err)
	}
	vncServerVersion := string(serverVersions)
	log.Printf("VNC 서버 버전: %s", vncServerVersion)

	// 2. 클라이언트 버전 전송 (Client -> Server)
	// 가장 최신 버전인 3.8을 선호 (PoC)
	clientVersion := []byte(VNCProtocolVersion38)
	if _, err := vncConn.Write(clientVersion); err != nil {
		return fmt.Errorf("클라이언트 버전 전송 실패: %w", err)
	}

	// 3. 보안 타입 협상 (Server -> Client)
	var numSecurityTypes uint8
	if err := binary.Read(vncConn, binary.BigEndian, &numSecurityTypes); err != nil {
		return fmt.Errorf("보안 타입 개수 읽기 실패: %w", err)
	}

	if numSecurityTypes == 0 { // Failed (RFB 6143, 7.1.1)
		var reasonLen uint32
		binary.Read(vncConn, binary.BigEndian, &reasonLen)
		reason := make([]byte, reasonLen)
		io.ReadFull(vncConn, reason)
		return fmt.Errorf("VNC 서버 보안 협상 실패: %s", string(reason))
	}

	securityTypes := make([]uint8, numSecurityTypes)
	if _, err := io.ReadFull(vncConn, securityTypes); err != nil {
		return fmt.Errorf("보안 타입 목록 읽기 실패: %w", err)
	}
	log.Printf("지원되는 보안 타입: %v", securityTypes)

	// 4. 클라이언트가 보안 타입 선택 (Client -> Server)
	// PoC에서는 SecurityTypeNone (1)을 우선 선택, 없으면 VNCAuth (2)도 시도 (구현은 안 함)
	chosenSecurityType := uint8(0)
	for _, st := range securityTypes {
		if st == SecurityTypeNone {
			chosenSecurityType = SecurityTypeNone
			break
		}
	}
	if chosenSecurityType == 0 {
		for _, st := range securityTypes {
			if st == SecurityTypeVNCAuth {
				chosenSecurityType = SecurityTypeVNCAuth
				break
			}
		}
	}
	if chosenSecurityType == 0 {
		return fmt.Errorf("지원하는 보안 타입 없음 (None 또는 VNCAuth).")
	}

	if err := binary.Write(vncConn, binary.BigEndian, chosenSecurityType); err != nil {
		return fmt.Errorf("선택된 보안 타입 전송 실패: %w", err)
	}
	log.Printf("선택된 보안 타입: %d", chosenSecurityType)

	// PoC: VNCAuth (SecurityType 2)는 구현하지 않음.
	if chosenSecurityType == SecurityTypeVNCAuth {
		// 실제 구현에서는 챌린지/응답 로직 및 비밀번호 검증 필요
		return fmt.Errorf("VNCAuth는 이 PoC에서 지원되지 않습니다.")
	}

	// 5. 보안 결과 (Server -> Client) (RFB 6143 7.1.1)
	if vncServerVersion != "RFB 003.003\n" { // 버전 3.3 이후에만
		var securityResult uint32
		if err := binary.Read(vncConn, binary.BigEndian, &securityResult); err != nil {
			return fmt.Errorf("보안 결과 읽기 실패: %w", err)
		}
		if securityResult != 0 { // 0: 성공, 비0: 실패
			var reasonLen uint32
			binary.Read(vncConn, binary.BigEndian, &reasonLen)
			reason := make([]byte, reasonLen)
			io.ReadFull(vncConn, reason)
			return fmt.Errorf("VNC 보안 결과 실패: %d, 이유: %s", securityResult, string(reason))
		}
		log.Println("VNC 보안 협상 성공.")
	}

	// 6. 클라이언트 초기화 메시지 (Client -> Server)
	// 공유 세션 여부 (PoC는 false로 가정)
	var sharedFlag byte = 0 // 0: 공유 안 함, 1: 공유
	if _, err := vncConn.Write([]byte{sharedFlag}); err != nil {
		return fmt.Errorf("클라이언트 초기화 메시지 전송 실패: %w", err)
	}

	// 7. 서버 초기화 메시지 (Server -> Client)
	var serverInit ServerInitMessage
	if err := binary.Read(vncConn, binary.BigEndian, &serverInit.FramebufferWidth); err != nil { return err }
	if err := binary.Read(vncConn, binary.BigEndian, &serverInit.FramebufferHeight); err != nil { return err }
	if err := binary.Read(vncConn, binary.BigEndian, &serverInit.PixelFormat); err != nil { return err }
	if err := binary.Read(vncConn, binary.BigEndian, &serverInit.NameLength); err != nil { return err }

	nameBytes := make([]byte, serverInit.NameLength)
	if _, err := io.ReadFull(vncConn, nameBytes); err != nil { return err }
	serverInit.Name = string(nameBytes)

	log.Printf("VNC 서버 초기화: %dx%d, 이름: %s", serverInit.FramebufferWidth, serverInit.FramebufferHeight, serverInit.Name)
	log.Printf("픽셀 포맷: BPP=%d, Depth=%d, TrueColor=%d, RedMax=%d, GreenMax=%d, BlueMax=%d, RedShift=%d, GreenShift=%d, BlueShift=%d",
		serverInit.PixelFormat.BPP, serverInit.PixelFormat.Depth, serverInit.PixelFormat.TrueColor,
		serverInit.PixelFormat.RedMax, serverInit.PixelFormat.GreenMax, serverInit.PixelFormat.BlueMax,
		serverInit.PixelFormat.RedShift, serverInit.PixelFormat.GreenShift, serverInit.PixelFormat.BlueShift)

	// 프론트엔드에 초기 화면 정보 전송
	initialFrameInfo := map[string]interface{}{
		"type":    "init",
		"width":   serverInit.FramebufferWidth,
		"height":  serverInit.FramebufferHeight,
		"pixelFormat": serverInit.PixelFormat, // PixelFormat 구조체 통째로 전달
		"name":    serverInit.Name,
	}
	if err := wsConn.WriteJSON(initialFrameInfo); err != nil {
		return fmt.Errorf("초기 프레임 정보 전송 실패: %w", err)
	}

	// Raw 인코딩 설정 (클라이언트 -> 서버)
	// SetEncodings 메시지 (RFC 6143 7.5.2)
	setEncodingsMsg := make([]byte, 8)
	setEncodingsMsg[0] = ClientMessageTypeSetEncodings // MessageType
	setEncodingsMsg[1] = 0 // Padding
	binary.BigEndian.PutUint16(setEncodingsMsg[2:4], 1) // Number of encodings (1개)
	binary.BigEndian.PutUint32(setEncodingsMsg[4:8], EncodingRaw) // Encoding ID (Raw = 0)

	if _, err := vncConn.Write(setEncodingsMsg); err != nil {
		return fmt.Errorf("SetEncodings 전송 실패: %w", err)
	}
	log.Println("Raw 인코딩 설정 메시지 전송 완료.")

	return nil
}
