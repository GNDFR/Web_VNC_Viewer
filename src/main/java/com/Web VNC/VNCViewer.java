package com.myvnc;

import com.myvnc.client.RFBClient;
import com.myvnc.ui.VNCDisplayPanel;

import javax.swing.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.io.IOException;

public class VNCViewer extends JFrame {

    private RFBClient rfbClient;
    private VNCDisplayPanel displayPanel;

    public VNCViewer(String host, int port) {
        setTitle("Simple Java VNC Viewer");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);

        displayPanel = new VNCDisplayPanel();
        add(displayPanel, BorderLayout.CENTER);

        rfbClient = new RFBClient(host, port, displayPanel);

        // 마우스 리스너 추가
        displayPanel.addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                rfbClient.sendMouseEvent(e, MouseEvent.MOUSE_PRESSED);
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                rfbClient.sendMouseEvent(e, MouseEvent.MOUSE_RELEASED);
            }
        });
        displayPanel.addMouseMotionListener(new MouseAdapter() {
            @Override
            public void mouseMoved(MouseEvent e) {
                rfbClient.sendMouseEvent(e, MouseEvent.MOUSE_MOVED);
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                rfbClient.sendMouseEvent(e, MouseEvent.MOUSE_DRAGGED);
            }
        });

        // 키보드 리스너 추가
        displayPanel.addKeyListener(new KeyAdapter() {
            @Override
            public void keyPressed(KeyEvent e) {
                rfbClient.sendKeyEvent(e, true); // Key down
            }

            @Override
            public void keyReleased(KeyEvent e) {
                rfbClient.sendKeyEvent(e, false); // Key up
            }
        });
        displayPanel.setFocusable(true); // 키보드 이벤트 받기 위함

        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                rfbClient.disconnect();
            }
        });

        pack();
        setLocationRelativeTo(null); // 화면 중앙에 배치
        setVisible(true);

        // 연결 시작
        new Thread(() -> {
            try {
                rfbClient.connect();
            } catch (IOException e) {
                JOptionPane.showMessageDialog(this, "VNC 서버 연결 오류: " + e.getMessage(), "오류", JOptionPane.ERROR_MESSAGE);
                e.printStackTrace();
                System.exit(1);
            }
        }).start();
    }

    public static void main(String[] args) {
        if (args.length < 2) {
            System.out.println("사용법: java VNCViewer <host> <port>");
            System.out.println("예시: java VNCViewer localhost 5900");
            return;
        }
        String host = args[0];
        int port = Integer.parseInt(args[1]);

        SwingUtilities.invokeLater(() -> new VNCViewer(host, port));
    }
}