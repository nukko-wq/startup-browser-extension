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
			// 拡張機能のコンテキストが有効かチェック
			if (!chrome.runtime?.id) {
				console.log('Extension context invalid')
				window.postMessage(
					{
						source: 'startup-extension',
						success: false,
						error: 'Extension context invalid',
					},
					'*',
				)
				return
			}

			// メッセージ送信を試みる
			const sendMessageWithRetry = async (retryCount = 0) => {
				try {
					const response = await chrome.runtime.sendMessage(event.data)
					window.postMessage(
						{
							source: 'startup-extension',
							...response,
						},
						'*',
					)
				} catch (error) {
					if (
						error.message === 'Extension context invalidated' &&
						retryCount < 3
					) {
						// 少し待ってから再試行
						setTimeout(() => sendMessageWithRetry(retryCount + 1), 1000)
					} else {
						console.error('Error sending message to background:', error)
						window.postMessage(
							{
								source: 'startup-extension',
								success: false,
								error: error.message,
							},
							'*',
						)
					}
				}
			}

			sendMessageWithRetry()
		}
	} catch (error) {
		console.error('Error in message handling:', error)
		window.postMessage(
			{
				source: 'startup-extension',
				success: false,
				error: `Extension error: ${error.message}`,
			},
			'*',
		)
	}
})

// 拡張機能のコンテキストが無効になった時の検出
let lastCheckTime = Date.now()
const checkExtensionContext = () => {
	if (!chrome.runtime?.id) {
		window.postMessage(
			{
				source: 'startup-extension',
				success: false,
				error: 'Extension context invalid',
			},
			'*',
		)
	}
	lastCheckTime = Date.now()
}

// 定期的にコンテキストをチェック
setInterval(checkExtensionContext, 5000)

// background.jsからのメッセージを処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'SHOW_SPACE_LIST_OVERLAY') {
		window.postMessage(
			{
				source: 'startup-extension',
				type: 'SHOW_SPACE_LIST_OVERLAY',
			},
			'*',
		)
		sendResponse({ success: true })
	}
	return true
})
