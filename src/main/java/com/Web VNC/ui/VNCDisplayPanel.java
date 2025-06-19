package com.myvnc.ui;

import javax.swing.*;
import java.awt.*;
import java.awt.image.BufferedImage;

public class VNCDisplayPanel extends JPanel {

    private BufferedImage image;

    public VNCDisplayPanel() {
        setPreferredSize(new Dimension(800, 600)); // 초기 패널 크기
        setBackground(Color.BLACK); // 연결 전 배경색
    }

    public void setImage(BufferedImage image) {
        this.image = image;
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        if (image != null) {
            // 이미지를 패널 크기에 맞게 그립니다. (비율 유지 또는 늘려서)
            // 여기서는 간단히 패널 크기에 맞춤
            g.drawImage(image, 0, 0, getWidth(), getHeight(), this);
        }
    }
}