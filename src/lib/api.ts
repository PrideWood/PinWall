export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(45000),
    headers: {
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "服务器返回异常，请重试。" }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.message || data.error || data.message || "请求失败。",
    );
  return data as T;
}
