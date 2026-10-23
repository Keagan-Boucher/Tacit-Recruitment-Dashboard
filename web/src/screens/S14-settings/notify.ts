/** What S14's cards can tell the page: a failure to retry (shown as the ErrorBanner) or a short confirmation (a toast). */
export type Problem = { title: string; detail?: string; retry: () => void };
export type Notify = { onProblem: (p: Problem) => void; onToast: (message: string) => void };
