// webpack.config.js
const path = require("path");

module.exports = {
  entry: "./src/components/remote-gazer/RemoteGazerClient.tsx", // 실제 파일명이 이게 맞는지 꼭 확인!
  output: {
    path: path.resolve(__dirname, "public"),
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  mode: "production",
};
