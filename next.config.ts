import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 개발 모드의 "N" 표시가 좁은 화면에서 왼쪽 아래 버튼(답변 작성·관리자와 공유)을 가려 잘 안 눌렸다 → 숨김.
  // 컴파일·실행 오류 표시는 그대로 뜬다. (배포 모드에는 원래 없음)
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
