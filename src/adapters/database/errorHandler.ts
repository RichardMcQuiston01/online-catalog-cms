/** Receives connection-level errors that the database driver emits as events. */
export type ConnectionErrorHandler = (error: Error) => void;

/**
 * Drivers such as ioredis and mysql2 emit connection problems as `error`
 * events, and Node.js exits the process when such an event has no listener.
 * Adapters always attach a listener; this picks the one to use.
 */
export function resolveErrorHandler(
  adapterName: string,
  onError?: ConnectionErrorHandler,
): ConnectionErrorHandler {
  if (onError) return onError;
  return (error) => {
    console.error(
      `[online-catalog-cms] ${adapterName} error: ${error.message}`,
    );
  };
}
