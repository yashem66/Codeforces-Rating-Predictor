import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** 简单的 JSON 磁盘缓存：每个 key 一个文件，存于指定目录。 */
export class JsonCache {
  constructor(private readonly dir: string) {}

  private fileFor(key: string): string {
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return join(this.dir, `${safe}.${hash}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.fileFor(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(key), JSON.stringify(value), 'utf8');
  }
}
