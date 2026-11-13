// generateRaw temporarily changes shared tavern settings. Only one phone request may own it at a time.
export class TextTasks {
  waiting = [];
  running = false;
  closed = false;
  run(task, {signal, background = false, valid = () => true} = {}) {
    return new Promise((resolve, reject) => {
      const cancelled = () => new DOMException('请求已取消，或聊天已切换', 'AbortError');
      if (this.closed || signal?.aborted) { reject(cancelled()); return; }
      const job = {task, resolve, reject, background, valid, signal, cancelled};
      job.abort = () => {
        const index = this.waiting.indexOf(job);
        if (index >= 0) { this.waiting.splice(index, 1); reject(cancelled()); }
      };
      signal?.addEventListener('abort', job.abort, {once: true});
      this.waiting.push(job);
      // Batch requests started by the same reply event before choosing the foreground task.
      queueMicrotask(() => this.next());
    });
  }
  async next() {
    if (this.running || this.closed) return;
    const index = this.waiting.findIndex(job => !job.background);
    const job = this.waiting.splice(index < 0 ? 0 : index, 1)[0];
    if (!job) return;
    this.running = true;
    job.signal?.removeEventListener('abort', job.abort);
    try {
      if (job.signal?.aborted || !job.valid()) throw job.cancelled();
      const result = await job.task();
      if (this.closed || job.signal?.aborted) throw job.cancelled();
      job.resolve(result);
    } catch (error) { job.reject(error); }
    finally { this.running = false; this.next(); }
  }
  close() {
    this.closed = true;
    for (const job of this.waiting.splice(0)) {
      job.signal?.removeEventListener('abort', job.abort);
      job.reject(job.cancelled());
    }
  }
}
