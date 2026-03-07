declare module "simple-audio-recorder" {
  export default class AudioRecorder {
    static preload(workerUrl: string): void;

    constructor(options?: { workerUrl?: string });

    /** Starts recording. Resolves when recording begins. */
    start(): Promise<void>;

    /** Stops recording. Resolves with the MP3 blob. */
    stop(): Promise<Blob>;

    /** Elapsed recording time in milliseconds. */
    readonly time: number;

    /** Whether the recorder is currently recording. */
    readonly isRecording: boolean;
  }
}
