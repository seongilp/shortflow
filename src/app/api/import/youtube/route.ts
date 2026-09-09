import { execFile } from 'node:child_process';
import { readFile, rm, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);

/**
 * yt-dlp는 네이티브 바이너리라 브라우저에서 돌지 않는다.
 * 배포 환경(데이터센터 IP)에서는 유튜브가 봇으로 차단하므로 로컬 개발에서만 연다.
 */
const ENABLED = process.env.NODE_ENV !== 'production';

/** 다운로드 상한. 브라우저 메모리로 통째로 넘어가므로 넉넉히 잡되 무제한은 아니다. */
const MAX_BYTES = 300 * 1024 * 1024;
const TIMEOUT_MS = 180_000;

/** 시스템 경계 검증. 유튜브 호스트만 통과시켜 임의 주소로 yt-dlp가 나가지 않게 막는다. */
const requestSchema = z.object({
  url: z
    .url()
    .refine(
      (value) => /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(new URL(value).hostname),
      '유튜브 주소만 가져올 수 있습니다.',
    ),
});

function fail(message: string, status: number, hint?: string) {
  return Response.json({ error: message, hint }, { status });
}

export async function POST(request: Request) {
  if (!ENABLED) {
    return fail('유튜브 가져오기는 로컬 개발 환경에서만 쓸 수 있습니다.', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('요청 본문을 읽지 못했습니다.', 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '유효한 유튜브 주소가 아닙니다.', 400);
  }
  const { url } = parsed.data;

  const workDir = await mkdtemp(join(tmpdir(), 'shortflow-'));

  try {
    // URL은 인자 배열로 넘어가므로 셸 해석을 거치지 않는다.
    await run(
      'yt-dlp',
      [
        '--no-playlist',
        '--max-filesize', String(MAX_BYTES),
        '-f', 'bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b',
        '--merge-output-format', 'mp4',
        '-o', join(workDir, 'video.%(ext)s'),
        url,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    );

    const files = await readdir(workDir);
    const downloaded = files.find((name) => name.startsWith('video.'));
    if (!downloaded) {
      return fail(
        '다운로드된 파일을 찾지 못했습니다. 용량 제한을 넘었거나 형식을 받지 못했습니다.',
        502,
      );
    }

    const data = await readFile(join(workDir, downloaded));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${downloaded}"`,
      },
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };

    if (err.code === 'ENOENT') {
      return fail('yt-dlp가 설치되어 있지 않습니다.', 500, 'brew install yt-dlp');
    }
    if (err.killed) {
      return fail('다운로드가 제한 시간을 넘었습니다. 더 짧은 영상을 시도해 주세요.', 504);
    }

    const stderr = (err.stderr ?? '').trim();
    console.error('[youtube-import] yt-dlp 실패:', stderr || err.message);

    if (/Sign in to confirm|bot/i.test(stderr)) {
      return fail(
        '유튜브가 봇으로 판단해 차단했습니다.',
        502,
        'yt-dlp --cookies-from-browser 옵션으로 로그인 세션을 넘겨야 할 수 있습니다.',
      );
    }
    return fail('영상을 받지 못했습니다. 주소를 확인해 주세요.', 502);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
