export interface DatabaseHealth {
  check(): Promise<void>;
  disconnect(): Promise<void>;
}
