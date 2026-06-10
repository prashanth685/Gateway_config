export class HttpClient {
  constructor(baseURL, opts) {
    this.baseUrl = baseURL;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...opts?.headers,
    };
  }

  async request(endpoint, config = {}) {
    const {
      method = "GET",
      params,
      body,
      headers,
      timeout = 30000,
      ...rest
    } = config;

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) =>
        url.searchParams.append(key, value.toString()),
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        ...rest,
        method,
        headers: { ...this.defaultHeaders, ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({})));
        throw new Error(errorData.message || `HTTP Error: ${response.status}`);
      }

      return (await response.json());
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }

  get(url, params, config) {
    return this.request(url, { ...config, method: "GET", params });
  }

  post(url, body, config) {
    return this.request(url, { ...config, method: "POST", body });
  }
}
