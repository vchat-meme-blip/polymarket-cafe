class TTSQueue {
  private queue: Array<() => Promise<void>> = [];
  private activeRequests = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const work = async () => {
        this.activeRequests++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
          this.processQueue();
        }
      };

      this.queue.push(work);
      this.processQueue();
    });
  }

  private processQueue() {
    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const work = this.queue.shift();
      if (work) work();
    }
  }
}

export const ttsQueue = new TTSQueue(3); // Using 3 to stay under the 5 concurrent limit
