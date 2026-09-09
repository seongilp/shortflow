import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

/**
 * next/font는 빌드 시점에 폰트를 자체 호스팅한다.
 * COEP(require-corp) 아래에서는 외부 폰트 CDN을 못 쓰므로 이 방식이어야 한다.
 */
const notoSansKr = Noto_Sans_KR({
  variable: '--font-caption',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ShortFlow — 유튜브 쇼츠 편집기',
  description: '브라우저에서 완결되는 쇼츠 편집기. 트림, 9:16 리프레임, 자막, MP4 내보내기.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-neutral-950">{children}</body>
    </html>
  );
}
