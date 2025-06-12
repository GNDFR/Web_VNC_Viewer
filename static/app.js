// static/app.js
document.addEventListener('DOMContentLoaded', () => {
    const vncHostInput = document.getElementById('vnc_host');
    const vncPortInput = document.getElementById('vnc_port');
    const toggleConnectButton = document.getElementById('toggle_connect');
    const statusText = document.getElementById('status');
    const vncCanvas = document.getElementById('vnc_canvas');
    const ctx = vncCanvas.getContext('2d');

    let ws = null; // WebSocket connection
    let isConnected = false;
    let framebufferWidth = 0;
    let framebufferHeight = 0;
    let pixelFormat = null; // VNC PixelFormat from server

    // 로컬 스토리지에서 마지막 연결 정보 불러오기
    if (localStorage.getItem('vnc_host')) {
        vncHostInput.value = localStorage.getItem('vnc_host');
    }
    if (localStorage.getItem('vnc_port')) {
        vncPortInput.value = localStorage.getItem('vnc_port');
    }

    // --- VNC 프로토콜 메시지 생성 및 전송 함수 (클라이언트 -> 서버) ---

    // FramebufferUpdateRequest 메시지 생성 (RFC 6143, 7.5.3)
    function sendFramebufferUpdateRequest(x, y, width, height, incremental = true) {
        const buffer = new ArrayBuffer(10);
        const view = new DataView(buffer);

        view.setUint8(0, 3); // MessageType: FramebufferUpdateRequest
        view.setUint8(1, incremental ? 1 : 0); // Incremental flag
        view.setUint16(2, x, false); // X-position (Big-endian)
        view.setUint16(4, y, false); // Y-position
        view.setUint16(6, width, false); // Width
        view.setUint16(8, height, false); // Height

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
        }
    }

    // PointerEvent (마우스) 메시지 생성 (RFC 6143, 7.5.5)
    function sendPointerEvent(buttonMask, x, y) {
        const buffer = new ArrayBuffer(6);
        const view = new DataView(buffer);

        view.setUint8(0, 5); // MessageType: PointerEvent
        view.setUint8(1, buttonMask); // ButtonMask (e.g., 1=left, 2=middle, 4=right)
        view.setUint16(2, x, false); // X-position
        view.setUint16(4, y, false); // Y-position

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
        }
    }

    // KeyEvent (키보드) 메시지 생성 (RFC 6143, 7.5.4)
    function sendKeyEvent(downFlag, keysym) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        view.setUint8(0, 4); // MessageType: KeyEvent
        view.setUint8(1, downFlag ? 1 : 0); // DownFlag (1=down, 0=up)
        view.setUint16(2, 0, false); // Padding
        view.setUint32(4, keysym, false); // Key (keysym)

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
        }
    }

    // --- 픽셀 데이터 렌더링 함수 (Raw 인코딩만 처리) ---
    // 이 함수는 Go 백엔드에서 받은 Raw 픽셀 데이터를 Canvas에 그립니다.
    function renderRawPixels(x, y, width, height, pixelData) {
        if (!pixelFormat) {
            console.error("Pixel format not initialized.");
            return;
        }

        // Canvas ImageData 객체 생성
        const imageData = ctx.createImageData(width, height);
        const outputBytes = imageData.data; // RGBA 바이트 배열 (Uint8ClampedArray)

        const bytesPerPixel = pixelFormat.BPP / 8; // VNC 서버의 픽셀 당 바이트 수

        for (let i = 0; i < width * height; i++) {
            // VNC 서버의 픽셀 데이터에서 각 채널 값 추출
            // 이 로직은 VNC 서버의 픽셀 포맷(BPP, TrueColor, RedMax/Shift 등)에 따라 다릅니다.
            // 여기서는 단순화를 위해 Go 서버가 이미 정제된 RGBA (또는 유사) 바이트 순서로 보낸다고 가정합니다.
            // 실제 구현에서는 server pixel format을 사용하여 정확한 RGBA 변환 로직이 필요합니다.

            // 예시: 32bpp TrueColor, little-endian (BGRx or RGBx) 가정
            // pixelData는 Go에서 byte[]로 넘어왔으므로 Uint8Array
            const dataOffset = i * bytesPerPixel;

            let r, g, b;

            if (pixelFormat.TrueColor === 1) { // True Color
                // 가장 흔한 32bpp BGRA/RGBA 리틀-엔디안
                // Go에서 바이트 배열로 보냈기 때문에 직접 접근
                if (pixelFormat.BPP === 32) {
                    // 예시: VNC 서버가 BGRx 순서로 보낸 경우 (little-endian)
                    // 즉, [B, G, R, X] 바이트
                    b = pixelData[dataOffset + 0];
                    g = pixelData[dataOffset + 1];
                    r = pixelData[dataOffset + 2];
                    // x (padding)는 무시
                } else if (pixelFormat.BPP === 24) {
                    r = pixelData[dataOffset + 0];
                    g = pixelData[dataOffset + 1];
                    b = pixelData[dataOffset + 2];
                } else {
                    // 다른 BPP 처리 로직 (이 PoC에서는 생략)
                    // 예를 들어, 16bpp, 8bpp 등은 별도의 비트 마스크 및 시프트 연산 필요
                    r = 0; g = 0; b = 0; // Fallback
                }

                // 픽셀 포맷의 Max 및 Shift 값을 사용하여 스케일링
                r = Math.round((r / pixelFormat.RedMax) * 255);
                g = Math.round((g / pixelFormat.GreenMax) * 255);
                b = Math.round((b / pixelFormat.BlueMax) * 255);

            } else { // Colormap (이 PoC에서는 지원 안 함)
                r = 0; g = 0; b = 0;
            }

            outputBytes[i * 4 + 0] = r; // R
            outputBytes[i * 4 + 1] = g; // G
            outputBytes[i * 4 + 2] = b; // B
            outputBytes[i * 4 + 3] = 255; // A (알파)
        }

        ctx.putImageData(imageData, x, y);
    }


    // --- WebSocket 연결 관리 ---
    const connectVNC = () => {
        const host = vncHostInput.value;
        const port = parseInt(vncPortInput.value, 10);

        if (!host || !port) {
            statusText.textContent = '호스트와 포트를 입력해주세요.';
            return;
        }

        localStorage.setItem('vnc_host', host);
        localStorage.setItem('vnc_port', port);

        statusText.textContent = `Connecting to ${host}:${port}...`;
        toggleConnectButton.disabled = true;

        // Go 백엔드 WebSocket 주소 구성
        // Render에서는 HTTP와 WebSocket이 같은 포트에서 제공됨.
        // Go 서버의 `/vnc-proxy` 엔드포인트에 VNC 서버 정보 쿼리 파라미터로 전달
        const wsUrl = `ws://${window.location.host}/vnc-proxy?host=${encodeURIComponent(host)}&port=${port}`;

        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer'; // 바이너리 데이터를 ArrayBuffer로 받음

        ws.onopen = () => {
            statusText.textContent = `Connected to VNC Gateway. Waiting for server init.`;
            isConnected = true;
        };

        ws.onmessage = event => {
            // 메시지 처리: Go 백엔드는 JSON 메시지를 보냅니다.
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    switch (msg.type) {
                        case 'init': // 초기화 메시지 (화면 크기, 픽셀 포맷 등)
                            framebufferWidth = msg.width;
                            framebufferHeight = msg.height;
                            pixelFormat = msg.pixelFormat; // Go 서버에서 파싱된 픽셀 포맷 객체
                            vncCanvas.width = framebufferWidth;
                            vncCanvas.height = framebufferHeight;
                            statusText.textContent = `Connected. Resolution: ${framebufferWidth}x${framebufferHeight}. Requesting full update...`;
                            // 초기 전체 화면 업데이트 요청
                            sendFramebufferUpdateRequest(0, 0, framebufferWidth, framebufferHeight, false); // Non-incremental
                            break;
                        case 'framebuffer_update': // 화면 업데이트 메시지
                            if (msg.encoding === 'raw') {
                                // Go 백엔드에서 byte[]로 보낸 픽셀 데이터
                                // JSON.parse 시, Go의 byte[]는 JS에서 배열로 변환됩니다.
                                const pixelData = new Uint8Array(msg.pixelData);
                                renderRawPixels(msg.x, msg.y, msg.width, msg.height, pixelData);
                                // 다음 업데이트 요청 (지속적인 업데이트를 위해)
                                sendFramebufferUpdateRequest(0, 0, framebufferWidth, framebufferHeight, true); // Incremental
                            }
                            break;
                        case 'bell':
                            console.log("VNC Bell!");
                            // 시각적 또는 청각적 피드백 제공 (옵션)
                            break;
                        case 'server_cut_text':
                            console.log("Server Cut Text (Clipboard):", msg.text);
                            // 클립보드 처리 (옵션)
                            break;
                        case 'error':
                            statusText.textContent = `Error: ${msg.message}`;
                            disconnectVNC();
                            break;
                        default:
                            console.log("Unknown text message type:", msg.type, msg);
                    }
                } catch (e) {
                    console.error("Failed to parse JSON message:", e, event.data);
                    statusText.textContent = `Error processing server message.`;
                    disconnectVNC();
                }
            } else if (event.data instanceof ArrayBuffer) {
                 // 현재 Go 백엔드는 VNC 데이터를 JSON으로 보냅니다.
                 // 이 브랜치는 Go가 바이너리 데이터를 직접 보낼 때 사용될 수 있습니다.
                 console.log("Received raw binary data (not expected in current PoC setup):", event.data);
            }
        };

        ws.onclose = (event) => {
            statusText.textContent = `Disconnected: ${event.code} - ${event.reason || 'Connection closed.'}`;
            toggleConnectButton.textContent = 'Connect';
            toggleConnectButton.disabled = false;
            isConnected = false;
            console.log("WebSocket Closed:", event);
        };

        ws.onerror = (error) => {
            statusText.textContent = `WebSocket Error.`;
            console.error("WebSocket Error:", error);
            disconnectVNC();
        };
    };

    const disconnectVNC = () => {
        if (ws) {
            ws.close();
        }
        isConnected = false;
        framebufferWidth = 0; // 화면 초기화
        framebufferHeight = 0;
        vncCanvas.width = 0;
        vncCanvas.height = 0;
        ctx.clearRect(0, 0, vncCanvas.width, vncCanvas.height);
    };

    toggleConnectButton.addEventListener('click', () => {
        if (isConnected) {
            disconnectVNC();
        } else {
            connectVNC();
        }
    });

    // --- 마우스 이벤트 처리 ---
    vncCanvas.addEventListener('mousedown', (e) => {
        if (!isConnected) return;
        const rect = vncCanvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        let buttonMask = 0;
        if (e.button === 0) buttonMask = 1; // Left button
        else if (e.button === 1) buttonMask = 2; // Middle button
        else if (e.button === 2) buttonMask = 4; // Right button
        sendPointerEvent(buttonMask, x, y);
    });

    vncCanvas.addEventListener('mouseup', (e) => {
        if (!isConnected) return;
        const rect = vncCanvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        sendPointerEvent(0, x, y); // All buttons up
    });

    vncCanvas.addEventListener('mousemove', (e) => {
        if (!isConnected) return;
        // 마우스 버튼이 눌려있을 때만 이동 이벤트 전송 (드래그)
        if (e.buttons === 0) return;
        const rect = vncCanvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        let buttonMask = 0;
        if (e.buttons & 1) buttonMask |= 1; // Left
        if (e.buttons & 4) buttonMask |= 2; // Middle
        if (e.buttons & 2) buttonMask |= 4; // Right
        sendPointerEvent(buttonMask, x, y);
    });

    // --- 키보드 이벤트 처리 ---
    // 주의: VNC Keysyms는 일반적인 JS keyCode/key와 다릅니다.
    // 완전한 구현을 위해서는 복잡한 키 코드 매핑이 필요합니다.
    // 여기서는 몇 가지 기본 키만 매핑합니다.
    document.addEventListener('keydown', (e) => {
        if (!isConnected) return;
        e.preventDefault(); // 브라우저 기본 동작 방지
        const keysym = mapKeyCodeToVNCKeysym(e.code);
        if (keysym !== null) {
            sendKeyEvent(true, keysym); // Key down
        }
    });

    document.addEventListener('keyup', (e) => {
        if (!isConnected) return;
        e.preventDefault(); // 브라우저 기본 동작 방지
        const keysym = mapKeyCodeToVNCKeysym(e.code);
        if (keysym !== null) {
            sendKeyEvent(false, keysym); // Key up
        }
    });

    // --- 키 코드 매핑 함수 (VNC Keysyms) ---
    // 출처: X Window System Keysyms와 VNC RFC 참조. 매우 불완전함.
    function mapKeyCodeToVNCKeysym(keyCode) {
        switch (keyCode) {
            case 'Digit0': return 0x30;
            case 'Digit1': return 0x31;
            // ... (0-9, A-Z 등 숫자 및 알파벳은 기본적으로 ASCII 값과 일치)
            case 'KeyA': return 0x61; // 'a'
            case 'KeyB': return 0x62; // 'b'
            // 대문자는 Shift와 함께 보내야 함
            
            // 특수 키
            case 'Backspace': return 0xFF08; // XK_BackSpace
            case 'Tab': return 0xFF09;     // XK_Tab
            case 'Enter': return 0xFF0D;   // XK_Return
            case 'Escape': return 0xFF1B;  // XK_Escape
            case 'Space': return 0x20;     // XK_space

            case 'ArrowLeft': return 0xFF51; // XK_Left
            case 'ArrowUp': return 0xFF52;   // XK_Up
            case 'ArrowRight': return 0xFF53; // XK_Right
            case 'ArrowDown': return 0xFF54; // XK_Down

            case 'ShiftLeft': return 0xFFE1; // XK_Shift_L
            case 'ShiftRight': return 0xFFE2; // XK_Shift_R
            case 'ControlLeft': return 0xFFE3; // XK_Control_L
            case 'ControlRight': return 0xFFE4; // XK_Control_R
            case 'AltLeft': return 0xFFE9; // XK_Meta_L (Alt)
            case 'AltRight': return 0xFFEA; // XK_Meta_R (Alt)

            // F1-F12
            case 'F1': return 0xFFBE;
            case 'F2': return 0xFFBF;
            // ...

            default:
                console.warn('Unhandled key code:', keyCode);
                return null;
        }
    }
});