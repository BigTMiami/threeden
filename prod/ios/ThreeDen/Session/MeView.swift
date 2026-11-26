import SwiftUI

/// You: your account, your signed-in devices, and Sign out.
struct MeView: View {
    let session: SessionModel
    let account: Account

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.name).font(.headline)
                    Text("@\(account.username)").foregroundStyle(.secondary)
                }
                LabeledContent("Email", value: account.email)
            }

            Section {
                if let error = session.devicesError {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(session.devices) { device in
                    DeviceRow(device: device)
                        .swipeActions {
                            if !device.current {
                                Button("Sign out", role: .destructive) {
                                    Task { await session.signOutDevice(device) }
                                }
                            }
                        }
                }
            } header: {
                Text("Your devices")
            } footer: {
                Text("Swipe left on a device to sign it out.")
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await session.signOut() }
                }
            } footer: {
                Text("Signs out this device only. Your other devices stay signed in.")
            }
        }
        .navigationTitle("Me")
        .task { await session.loadDevices() }
        .refreshable { await session.loadDevices() }
    }
}

private struct DeviceRow: View {
    let device: DeviceSession

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(device.deviceName)
                if device.current {
                    Text("This device")
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.tint.opacity(0.15), in: Capsule())
                }
            }
            Text("Last used \(device.lastUsedAt, format: .relative(presentation: .named))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
