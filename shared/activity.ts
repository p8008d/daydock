export const activityEvents = ['open', 'bookmark_open', 'dashboard_edit', 'dashboard_switch', 'dashboard_export'] as const
export type ActivityEvent = typeof activityEvents[number]

export interface ActivityPayload {
  browserId: string
  event: ActivityEvent
  saved: boolean
  customized: boolean
  firstInteraction: boolean
}
