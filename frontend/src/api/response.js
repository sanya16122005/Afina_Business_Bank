export function getResponseData(response) {
  // Backend responses are wrapped in a few different shapes, so normalize them once here.
  return response?.data?.data ?? response?.data ?? null;
}

export function getResponseList(response) {
  const data = getResponseData(response);
  return Array.isArray(data) ? data : [];
}

export function getResponseSummary(response) {
  return response?.data?.summary ?? null;
}

export function getResponseCount(response) {
  const data = getResponseData(response);
  if (Array.isArray(data)) return data.length;

  const total = response?.data?.meta?.total;
  return Number.isFinite(total) ? total : Number(total) || 0;
}