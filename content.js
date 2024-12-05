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
	// 同じオリジンからのメッセージのみを処理
	if (event.source !== window) return

	// startup-extensionからのメッセージは無視（無限ループを防ぐ）
	if (event.data.source === 'startup-extension') return

	try {
		// background.jsからのメッセージの場合はextensionIdチェックをスキップ
		if (event.data.source === 'webapp') {
			const extensionId = event.data.extensionId
			if (!extensionId) {
				throw new Error('Extension ID is missing')
			}

			chrome.runtime
				.sendMessage(extensionId, event.data)
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
