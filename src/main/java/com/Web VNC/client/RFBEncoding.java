package com.myvnc.client;

import java.awt.image.BufferedImage;
import java.io.DataInputStream;
import java.io.IOException;

// RFB 인코딩을 처리하기 위한 인터페이스
public interface RFBEncoding {
    int getEncodingType(); // 인코딩 타입 (예: 0 for Raw, 5 for Tight, etc.)

    // 화면 업데이트 데이터를 읽고 BufferedImage에 그리는 메서드
    void decode(DataInputStream in, BufferedImage image, int x, int y, int width, int height, RFBPixelFormat pixelFormat) throws IOException;

    // 실제 VNC 뷰어는 다양한 인코딩을 지원해야 합니다.
    // Raw, CopyRect, RRE, Hextile, ZRLE, Tight 등
}

// 예시: Raw 인코딩
class RawEncoding implements RFBEncoding {
    @Override
    public int getEncodingType() {
        return 0; // Raw encoding type
    }

    @Override
    public void decode(DataInputStream in, BufferedImage image, int x, int y, int width, int height, RFBPixelFormat pixelFormat) throws IOException {
        // Raw 인코딩은 픽셀 데이터를 그대로 전송합니다.
        // 여기서는 RGB 픽셀 데이터를 읽어 BufferedImage에 그리는 로직이 필요합니다.
        // pixelFormat에 따라 데이터 해석 방식이 달라집니다.
        // 예: 24비트 트루컬러 (RGBX)
        for (int j = y; j < y + height; j++) {
            for (int i = x; i < x + width; i++) {
                int r = in.readUnsignedByte();
                int g = in.readUnsignedByte();
                int b = in.readUnsignedByte();
                // 4번째 바이트는 보통 무시됨 (XRGB)
                in.readUnsignedByte();
                int rgb = (r << 16) | (g << 8) | b;
                image.setRGB(i, j, rgb);
            }
        }
        // 이 부분은 RFBPixelFormat에 따라 복잡해집니다.
        // Endianness, TrueColor 여부, 각 색상 채널의 비트 수 및 시프트 값 등을 고려해야 합니다.
    }
}