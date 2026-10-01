import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getDeviceAlertPermission,
  isProtectedIncomingMessage,
  notifyProtectedMessage,
} from "@/lib/device-alerts"

class FakeNotification {
  static permission: NotificationPermission = "granted"
  static instances: FakeNotification[] = []
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  onclick: (() => void) | null = null

  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    FakeNotification.instances.push(this)
  }

  close = vi.fn()
}

describe("protected-message device alerts", () => {
  beforeEach(() => {
    FakeNotification.permission = "granted"
    FakeNotification.instances = []
    vi.stubGlobal("window", {
      Notification: FakeNotification,
      focus: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shows a generic device alert that opens only the matching conversation", () => {
    const openConversation = vi.fn()

    expect(notifyProtectedMessage("conversation-1", "message-7", openConversation)).toBe(true)

    const notification = FakeNotification.instances[0]
    expect(notification.title).toBe("Trinetra Protection Alert")
    expect(notification.options.body).not.toContain("message body")
    expect(notification.options.requireInteraction).toBe(true)
    notification.onclick?.()
    expect(openConversation).toHaveBeenCalledOnce()
    expect(notification.close).toHaveBeenCalledOnce()
  })

  it("does not create a device alert when permission is denied", () => {
    FakeNotification.permission = "denied"

    expect(getDeviceAlertPermission()).toBe("denied")
    expect(notifyProtectedMessage("conversation-1", "message-7", vi.fn())).toBe(false)
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it("only recognizes locked messages addressed to the current user", () => {
    expect(isProtectedIncomingMessage({
      senderId: "sender",
      receiverId: "receiver",
      trinetraLocked: true,
    }, "receiver")).toBe(true)
    expect(isProtectedIncomingMessage({
      senderId: "sender",
      receiverId: "receiver",
      trinetraLocked: false,
    }, "receiver")).toBe(false)
    expect(isProtectedIncomingMessage({
      senderId: "sender",
      receiverId: "receiver",
      trinetraLocked: true,
    }, "sender")).toBe(false)
  })
})
