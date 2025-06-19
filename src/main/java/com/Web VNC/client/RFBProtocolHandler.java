package com.myvnc.client;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

// RFB 프로토콜 메시지를 처리하는 유틸리티 클래스
public class RFBProtocolHandler {

    private DataInputStream in;
    private DataOutputStream out;

    public RFBProtocolHandler(DataInputStream in, DataOutputStream out) {
        this.in = in;
        this.out = out;
    }

    // --- 핸드셰이크 단계 ---
    public String readProtocolVersion() throws IOException {
        byte[] versionBytes = new byte[12];
        in.readFully(versionBytes);
        return new String(versionBytes, "US-ASCII");
    }

    public void writeProtocolVersion(String version) throws IOException {
        out.writeBytes(version);
        out.flush();
    }

    public byte[] readSecurityTypes() throws IOException {
        int numSecurityTypes = in.readUnsignedByte();
        byte[] securityTypes = new byte[numSecurityTypes];
        in.readFully(securityTypes);
        return securityTypes;
    }

    public void writeSecurityType(byte type) throws IOException {
        out.writeByte(type);
        out.flush();
    }

    // --- 초기화 단계 ---
    public RFBPixelFormat readServerInit() throws IOException {
        // 서버 초기화 메시지를 파싱하여 RFBPixelFormat 객체를 반환합니다.
        // 프레임버퍼 너비, 높이, 픽셀 포맷 등이 포함됩니다.
        // 이 부분은 RFB 프로토콜 스펙을 정확히 따라야 합니다.
        int framebufferWidth = in.readUnsignedShort();
        int framebufferHeight = in.readUnsignedShort();

        RFBPixelFormat pixelFormat = new RFBPixelFormat();
        pixelFormat.bitsPerPixel = in.readUnsignedByte();
        pixelFormat.depth = in.readUnsignedByte();
        pixelFormat.bigEndianFlag = (in.readUnsignedByte() == 1);
        pixelFormat.trueColorFlag = (in.readUnsignedByte() == 1);
        pixelFormat.redMax = in.readUnsignedShort();
        pixelFormat.greenMax = in.readUnsignedShort();
        pixelFormat.blueMax = in.readUnsignedShort();
        pixelFormat.redShift = in.readUnsignedByte();
        pixelFormat.greenShift = in.readUnsignedByte();
        pixelFormat.blueShift = in.readUnsignedByte();
        pixelFormat.padding = new byte[3];
        in.readFully(pixelFormat.padding); // 3 bytes padding

        // 서버 화면 이름 길이 읽기
        int nameLength = in.readInt();
        byte[] nameBytes = new byte[nameLength];
        in.readFully(nameBytes);
        String serverName = new String(nameBytes, "US-ASCII"); // 서버 화면 이름

        System.out.println("서버 화면 크기: " + framebufferWidth + "x" + framebufferHeight);
        System.out.println("서버 이름: " + serverName);

        return pixelFormat;
    }

    public void writeClientSetPixelFormat(RFBPixelFormat pixelFormat) throws IOException {
        // 클라이언트 픽셀 포맷 설정 메시지 전송
        out.writeByte(0); // Message type: SetPixelFormat
        out.writeByte(0); // Padding
        out.writeByte(0); // Padding
        out.writeByte(0); // Padding

        out.writeByte(pixelFormat.bitsPerPixel);
        out.writeByte(pixelFormat.depth);
        out.writeByte(pixelFormat.bigEndianFlag ? 1 : 0);
        out.writeByte(pixelFormat.trueColorFlag ? 1 : 0);
        out.writeShort(pixelFormat.redMax);
        out.writeShort(pixelFormat.greenMax);
        out.writeShort(pixelFormat.blueMax);
        out.writeByte(pixelFormat.redShift);
        out.writeByte(pixelFormat.greenShift);
        out.writeByte(pixelFormat.blueShift);
        out.write(new byte[3]); // Padding
        out.flush();
    }

    public void writeClientSetEncodings(int[] encodings) throws IOException {
        // 클라이언트 인코딩 설정 메시지 전송
        out.writeByte(2); // Message type: SetEncodings
        out.writeByte(0); // Padding
        out.writeShort(encodings.length); // Number of encodings

        for (int encoding : encodings) {
            out.writeInt(encoding);
        }
        out.flush();
    }

    // --- 일반 동작 단계 ---
    public void writeFramebufferUpdateRequest(boolean incremental, int x, int y, int width, int height) throws IOException {
        out.writeByte(3); // Message type: FramebufferUpdateRequest
        out.writeByte(incremental ? 1 : 0); // Incremental flag
        out.writeShort(x);
        out.writeShort(y);
        out.writeShort(width);
        out.writeShort(height);
        out.flush();
    }

    public void writeKeyEvent(int key, boolean down) throws IOException {
        out.writeByte(4); // Message type: KeyEvent
        out.writeByte(down ? 1 : 0); // Down flag
        out.writeShort(0); // Padding
        out.writeInt(key); // Key symbol
        out.flush();
    }

    public void writePointerEvent(int buttonMask, int x, int y) throws IOException {
        out.writeByte(5); // Message type: PointerEvent
        out.writeByte(buttonMask); // Button mask
        out.writeShort(x);
        out.writeShort(y);
        out.flush();
    }

    // 서버로부터 수신되는 메시지 처리 (FrameBufferUpdate 등)
    public int readServerMessageHeader() throws IOException {
        return in.readUnsignedByte(); // 메시지 타입 읽기
    }

    // FramebufferUpdate 메시지 파싱
    // 이 메서드는 상당히 복잡해질 것입니다.
    public void handleFramebufferUpdate(RFBPixelFormat pixelFormat, Map<Integer, RFBEncoding> encodingMap, BufferedImage displayImage) throws IOException {
        in.readUnsignedByte(); // Padding
        int numRectangles = in.readUnsignedShort();

        for (int i = 0; i < numRectangles; i++) {
            int x = in.readUnsignedShort();
            int y = in.readUnsignedShort();
            int width = in.readUnsignedShort();
            int height = in.readUnsignedShort();
            int encodingType = in.readInt();

            RFBEncoding encoding = encodingMap.get(encodingType);
            if (encoding == null) {
                System.err.println("지원되지 않는 인코딩: " + encodingType);
                // 지원되지 않는 인코딩은 해당 부분의 데이터를 건너뛰어야 합니다.
                // 이는 RFB 프로토콜 스펙을 참조해야 합니다.
                // 여기서는 간단히 오류 처리
                throw new IOException("Unsupported encoding: " + encodingType);
            }
            encoding.decode(in, displayImage, x, y, width, height, pixelFormat);
        }
    }
}