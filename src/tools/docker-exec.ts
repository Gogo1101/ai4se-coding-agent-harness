import Docker from 'dockerode';
import type { Config } from '../types.js';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

export interface ExecResult { stdout: string; stderr: string; exitCode: number }

export class DockerExec {
  private docker: Docker;
  private image: string;
  private workDir: string;
  private memoryLimit: string;

  constructor(config: Config) {
    this.docker = new Docker();
    this.image = config.docker.image;
    this.workDir = config.docker.workDir;
    this.memoryLimit = config.docker.memoryLimit;
  }

  async createContainer(taskId: string): Promise<string> {
    const container = await this.docker.createContainer({
      Image: this.image, Cmd: ['sleep', '3600'], WorkingDir: this.workDir, Tty: false,
      HostConfig: { Memory: this.parseMemory(this.memoryLimit), NetworkMode: 'none' },
      Labels: { 'harness.task-id': taskId, 'harness.container-id': randomUUID() },
    });
    await container.start();
    return container.id;
  }

  async writeFile(containerId: string, path: string, content: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const tar = this.createTar(path, content);
    const lastSlash = path.lastIndexOf('/');
    const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : this.workDir;
    await container.putArchive(tar, { path: dir });
  }

  async readFile(containerId: string, path: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({ Cmd: ['cat', path], AttachStdout: true, AttachStderr: true });
    return new Promise((resolve, reject) => {
      exec.start({}, (err: Error | null, stream?: Readable) => {
        if (err) { reject(err); return; }
        if (!stream) { reject(new Error('exec stream unavailable')); return; }
        let output = '';
        stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
        stream.on('end', () => resolve(output.trim()));
      });
    });
  }

  async exec(containerId: string, command: string): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({ Cmd: ['sh', '-c', command], AttachStdout: true, AttachStderr: true, Tty: true });
    return new Promise((resolve, reject) => {
      exec.start({}, (err: Error | null, stream?: Readable) => {
        if (err) { reject(err); return; }
        if (!stream) { reject(new Error('exec stream unavailable')); return; }
        let stdout = '';
        stream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.on('end', () => resolve({ stdout: stdout.trim(), stderr: '', exitCode: 0 }));
        stream.on('error', reject);
      });
    });
  }

  async remove(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.kill().catch(() => {});
    await container.remove().catch(() => {});
  }

  private parseMemory(limit: string): number {
    const m = limit.match(/^(\d+)(m|mb|g|gb)$/i);
    if (!m) return 256 * 1024 * 1024;
    const v = parseInt(m[1]);
    return m[2].toLowerCase().startsWith('g') ? v * 1024 * 1024 * 1024 : v * 1024 * 1024;
  }

  private createTar(path: string, content: string): Readable {
    const filename = path.substring(path.lastIndexOf('/') + 1);
    const contentBuf = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(filename, 0);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    const sizeOct = contentBuf.length.toString(8).padStart(11, '0');
    header.write(sizeOct + '\0', 124);
    header.write('00000000000\0', 136);
    header.write('        ', 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const checksumOct = checksum.toString(8).padStart(6, '0');
    header.write(checksumOct + '\0 ', 148);
    const padding = Buffer.alloc(512 - (contentBuf.length % 512));
    const endBlock = Buffer.alloc(1024);
    return Readable.from([header, contentBuf, padding, endBlock]);
  }
}
