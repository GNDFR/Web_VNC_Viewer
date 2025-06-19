package com.myvnc.client;

import com.myvnc.ui.VNCDisplayPanel;

import java.awt.event.KeyEvent;
import java.awt.event.MouseEvent;
import java.awt.image.BufferedImage;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class RFBClient {
    private String host;
    private int port;
    private Socket socket;
    private DataInputStream in;
    private DataOutputStream out;
    private RFBProtocolHandler protocolHandler;
    private VNCDisplayPanel displayPanel;
    private BufferedImage remoteFramebuffer;
    private RFBPixelFormat serverPixelFormat;
    private Map<Integer, RFBEncoding> supportedEncodings;

    private ScheduledExecutorService updateScheduler; // 주기적인 화면 업데이트 요청 스케줄러

    public RFBClient(String host, int port, VNCDisplayPanel displayPanel) {
        this.host = host;
        this.port = port;
        this.displayPanel = displayPanel;
        this.supportedEncodings = new HashMap<>();
        // 지원할 인코딩 추가
        supportedEncodings.put(0, new RawEncoding()); // Raw
        // TODO: CopyRect, RRE, Hextile, ZRLE, Tight 등 다른 인코딩 구현 및 추가
    }

    public void connect() throws IOException {
        System.out.println(host + ":" + port + " 에 연결 중...");
        socket = new Socket(host, port);
        in = new DataInputStream(socket.getInputStream());
        out = new DataOutputStream(socket.getOutputStream());
        protocolHandler = new RFBProtocolHandler(in, out);

        // 1. 핸드셰이크
        String serverVersion = protocolHandler.readProtocolVersion();
        System.out.println("서버 RFB 버전: " + serverVersion.trim());
        protocolHandler.writeProtocolVersion("RFB 003.008\n"); // 클라이언트 버전 전송 (3.8 버전을 선호)

        byte[] securityTypes = protocolHandler.readSecurityTypes();
        System.out.println("지원되는 보안 타입: " + Arrays.toString(securityTypes));
        // Simple VNC Authentication (Type 2) 또는 None (Type 1) 선택
        if (securityTypes.length == 0) {
            throw new IOException("서버가 지원하는 보안 타입이 없습니다.");
        }
        if (contains(securityTypes, (byte) 2)) { // VNC Authentication
            protocolHandler.writeSecurityType((byte) 2);
            // TODO: 비밀번호 입력 및 인증 처리
            System.out.println("VNC Authentication 필요. 비밀번호를 입력해주세요.");
            // 실제 구현에서는 비밀번호 입력 UI를 띄워야 합니다.
            // 예시: 간단히 "password"라고 가정
            // protocolHandler.sendVncAuthResponse("password");
            // int authResult = protocolHandler.readVncAuthResult();
            // if (authResult != 0) { throw new IOException("인증 실패!"); }
        } else if (contains(securityTypes, (byte) 1)) { // None
            protocolHandler.writeSecurityType((byte) 1);
            System.out.println("보안 인증 없음.");
        } else {
            throw new IOException("지원되는 보안 타입이 없습니다.");
        }

        // 2. 초기화
        serverPixelFormat = protocolHandler.readServerInit(); // 서버 픽셀 포맷 및 화면 크기 수신

        // 클라이언트 픽셀 포맷 설정 (서버와 동일하게)
        protocolHandler.writeClientSetPixelFormat(serverPixelFormat);

        // 클라이언트 인코딩 설정 (지원하는 인코딩 목록 전송)
        int[] clientEncodings = supportedEncodings.keySet().stream().mapToInt(Integer::intValue).toArray();
        protocolHandler.writeClientSetEncodings(clientEncodings);

        // 화면 초기화
        remoteFramebuffer = new BufferedImage(
                displayPanel.getPreferredSize().width, // 초기화 메시지에서 받은 서버 너비/높이 사용
                displayPanel.getPreferredSize().height, // 하지만 이 예시에서는 displayPanel의 초기 크기 사용
                BufferedImage.TYPE_INT_RGB
        );
        displayPanel.setImage(remoteFramebuffer);

        // 3. 일반 동작: 화면 업데이트 요청 및 이벤트 처리 스레드 시작
        startReceiveThread();
        startUpdateScheduler();
    }

    private boolean contains(byte[] array, byte value) {
        for (byte b : array) {
            if (b == value) return true;
        }
        return false;
    }

    private void startReceiveThread() {
        Thread receiveThread = new Thread(() -> {
            try {
                while (!socket.isClosed()) {
                    int messageType = protocolHandler.readServerMessageHeader();
                    switch (messageType) {
                        case 0: // FramebufferUpdate
                            protocolHandler.handleFramebufferUpdate(serverPixelFormat, supportedEncodings, remoteFramebuffer);
                            displayPanel.repaint(); // 화면 업데이트 후 다시 그리기
                            break;
                        // TODO: 다른 서버 메시지 타입 처리 (Bell, ServerCutText 등)
                        default:
                            System.err.println("알 수 없는 서버 메시지 타입: " + messageType);
                            // 알 수 없는 메시지의 데이터를 건너뛰는 로직 필요
                            break;
                    }
                }
            } catch (IOException e) {
                System.err.println("데이터 수신 오류: " + e.getMessage());
                disconnect();
            }
        });
        receiveThread.setDaemon(true);
        receiveThread.start();
    }

    private void startUpdateScheduler() {
        updateScheduler = Executors.newSingleThreadScheduledExecutor();
        // 100ms마다 전체 화면 업데이트 요청 (개념적 예시, 실제 VNC는 증분 업데이트 활용)
        updateScheduler.scheduleAtFixedRate(() -> {
            try {
                // 현재 화면 크기만큼의 업데이트 요청
                protocolHandler.writeFramebufferUpdateRequest(
                        true, // 증분 업데이트 (서버가 변경된 부분만 보내도록)
                        0, 0,
                        remoteFramebuffer.getWidth(),
                        remoteFramebuffer.getHeight()
                );
            } catch (IOException e) {
                System.err.println("업데이트 요청 오류: " + e.getMessage());
                updateScheduler.shutdownNow();
            }
        }, 0, 100, TimeUnit.MILLISECONDS); // 0.1초마다 요청
    }

    public void sendMouseEvent(MouseEvent e, int type) {
        try {
            int buttonMask = 0;
            if (e.getButton() == MouseEvent.BUTTON1) buttonMask |= 1; // Left button
            if (e.getButton() == MouseEvent.BUTTON2) buttonMask |= 2; // Middle button
            if (e.getButton() == MouseEvent.BUTTON3) buttonMask |= 4; // Right button

            if (type == MouseEvent.MOUSE_PRESSED) {
                protocolHandler.writePointerEvent(buttonMask, e.getX(), e.getY());
            } else if (type == MouseEvent.MOUSE_RELEASED) {
                protocolHandler.writePointerEvent(0, e.getX(), e.getY()); // 버튼 떼면 마스크 0
            } else if (type == MouseEvent.MOUSE_MOVED || type == MouseEvent.MOUSE_DRAGGED) {
                protocolHandler.writePointerEvent(buttonMask, e.getX(), e.getY());
            }

        } catch (IOException ex) {
            System.err.println("마우스 이벤트 전송 오류: " + ex.getMessage());
        }
    }

    public void sendKeyEvent(KeyEvent e, boolean down) {
        try {
            // Java KeyEvent의 keyCode를 RFB key symbol로 변환하는 매핑이 필요합니다.
            // RFB key symbols은 X11 key codes와 유사합니다.
            // 예시: 간단히 KeyEvent.VK_A를 'A'의 ASCII 코드로 보냄 (매우 단순화)
            int rfbKeySymbol = e.getKeyCode(); // 이 부분은 실제 RFB 심볼 매핑이 필요!
            if (e.getKeyChar() != KeyEvent.CHAR_UNDEFINED) {
                rfbKeySymbol = e.getKeyChar();
            }

            protocolHandler.writeKeyEvent(rfbKeySymbol, down);
        } catch (IOException ex) {
            System.err.println("키 이벤트 전송 오류: " + ex.getMessage());
        }
    }


    public void disconnect() {
        this.running = false; // Add a running flag to gracefully stop threads
        if (updateScheduler != null) {
            updateScheduler.shutdownNow();
        }
        try {
            if (socket != null && !socket.isClosed()) {
                socket.close();
                System.out.println("VNC 연결이 종료되었습니다.");
            }
        } catch (IOException e) {
            System.err.println("연결 종료 중 오류: " + e.getMessage());
        }
    }
}