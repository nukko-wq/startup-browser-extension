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
