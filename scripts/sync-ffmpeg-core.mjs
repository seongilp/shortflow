// ffmpeg 코어를 public/ 아래로 복사한다.
// COEP(require-corp) 때문에 외부 CDN에서 코어를 받을 수 없어 자체 호스팅이 필요하다.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@ffmpeg/core-mt/dist/umd');
const to = join(root, 'public/ffmpeg');
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'];

await mkdir(to, { recursive: true });
for (const file of files) {
  await copyFile(join(from, file), join(to, file));
}
console.log(`ffmpeg 코어 ${files.length}개를 public/ffmpeg 로 복사했습니다.`);
