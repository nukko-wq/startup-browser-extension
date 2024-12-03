import type { PlasmoCSConfig } from 'plasmo'

export const config: PlasmoCSConfig = {
	matches: ['http://localhost:3000/*', 'https://startup.nukko.dev/*'],
}

let isListenerAttached = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3

function attachMessageListener() {
	if (isListenerAttached) return

	try {
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			try {
				if (message.type === 'TABS_UPDATED') {
					console.log('Content script received tabs update:', message)
					window.postMessage(
						{
							source: 'startup-extension',
							type: 'TABS_UPDATED',
							tabs: message.tabs,
						},
						window.location.origin,
					)
				}
				sendResponse({ received: true })
				return true
			} catch (error) {
				console.error('Error in message listener:', error)
				sendResponse({ received: false, error: error.message })
				return false
			}
		})

		isListenerAttached = true
		reconnectAttempts = 0
	} catch (error) {
		console.error('Error attaching listener:', error)
		if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
			reconnectAttempts++
			setTimeout(attachMessageListener, 1000 * reconnectAttempts)
		}
	}
}

attachMessageListener()

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		isListenerAttached = false
		attachMessageListener()
	}
})
