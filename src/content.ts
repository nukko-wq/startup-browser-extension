import type { PlasmoCSConfig } from 'plasmo'

export const config: PlasmoCSConfig = {
	matches: ['http://localhost:3000/*', 'https://*.nukko.dev/*'],
}

let isListenerAttached = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3

function attachMessageListener() {
	if (isListenerAttached) return

	try {
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
		})

		isListenerAttached = true
		reconnectAttempts = 0
	} catch (error) {
		if (error.message === 'Extension context invalidated.') {
			console.log('Extension was reloaded, attempting to reconnect...')
			if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
				reconnectAttempts++
				setTimeout(attachMessageListener, 1000 * reconnectAttempts)
			} else {
				console.error('Max reconnection attempts reached')
			}
		} else {
			console.error('Error in content script:', error)
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
