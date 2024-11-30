import type { PlasmoCSConfig } from 'plasmo'

export const config: PlasmoCSConfig = {
	matches: ['http://localhost:3000/*', 'https://*.nukko.dev/*'],
}

let isListenerAttached = false

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
	} catch (error) {
		if (error.message === 'Extension context invalidated.') {
			console.log('Extension was reloaded, content script needs refresh')
			setTimeout(attachMessageListener, 1000)
		} else {
			console.error('Error in content script:', error)
		}
	}
}

attachMessageListener()

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		attachMessageListener()
	}
})
