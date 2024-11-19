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

// タブの変更を監視
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		chrome.runtime.sendMessage({ type: 'REQUEST_TABS_UPDATE' })
	}
})
