// background.jsからのメッセージをWebアプリに転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	try {
		window.postMessage(message, '*')
		sendResponse({ received: true })
	} catch (error) {
		console.error('Error posting message:', error)
	}
	return true
})

// Webアプリからのメッセージをbackground.jsに転送
window.addEventListener('message', (event) => {
	if (event.source !== window) return
	if (event.data.source === 'startup-extension') return

	try {
		if (event.data.source === 'webapp') {
			// extensionIdがある場合は外部メッセージング、ない場合は内部メッセージングを使用
			const messagePromise = event.data.extensionId
				? chrome.runtime.sendMessage(event.data.extensionId, event.data)
				: chrome.runtime.sendMessage(event.data)

			messagePromise
				.then((response) => {
					if (response) {
						window.postMessage(
							{
								source: 'startup-extension',
								...response,
							},
							'*',
						)
					}
				})
				.catch((error) => {
					console.error('Error sending message to background:', error)
					window.postMessage(
						{
							source: 'startup-extension',
							success: false,
							error: error.message,
						},
						'*',
					)
				})
		}
	} catch (error) {
		console.error('Error in message handling:', error)
	}
})
