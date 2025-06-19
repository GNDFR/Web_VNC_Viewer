package com.myvnc.client;

// RFB 픽셀 포맷 정보를 담는 클래스
public class RFBPixelFormat {
    public int bitsPerPixel;
    public int depth;
    public boolean bigEndianFlag;
    public boolean trueColorFlag;
    public int redMax;
    public int greenMax;
    public int blueMax;
    public int redShift;
    public int greenShift;
    public int blueShift;
    public byte[] padding; // 3바이트 패딩

    // 생성자, getter/setter 등 필요
    // RFB 프로토콜의 ServerInit 메시지에서 이 정보를 파싱해야 합니다.
}