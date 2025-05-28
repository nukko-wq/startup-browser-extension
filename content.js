// メッセージ処理の重複を防ぐためのフラグ
let isProcessingMessage = false

// background.jsからのメッセージをWebアプリに転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	try {
		// TABS_UPDATEDメッセージを確実にWebアプリに転送
		if (message.type === 'TABS_UPDATED') {
			window.postMessage(
				{
					source: 'startup-extension',
					type: 'TABS_UPDATED',
					tabs: message.tabs,
				},
				'*',
			)
			sendResponse({ received: true })
			return true
		}

		if (message.type === 'SHOW_SPACE_LIST_OVERLAY') {
			console.log('Forwarding SHOW_SPACE_LIST_OVERLAY message to webapp')
			window.postMessage(
				{
					source: 'startup-extension',
					type: 'SHOW_SPACE_LIST_OVERLAY',
				},
				'*',
			)
			sendResponse({ success: true })
			return true
		}

		// その他のメッセージも転送
		window.postMessage(
			{
				source: 'startup-extension',
				...message,
			},
			'*',
		)
		sendResponse({ received: true })
		return true
	} catch (error) {
		console.error('Error posting message:', error)
		sendResponse({ success: false, error: error.message })
		return true
	}
})

// Webアプリからのメッセージをbackground.jsに転送
window.addEventListener('message', (event) => {
	if (event.source !== window) return
	if (event.data.source === 'startup-extension') return
	if (isProcessingMessage) return

	try {
		if (event.data.source === 'webapp') {
			isProcessingMessage = true

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
				isProcessingMessage = false
				return
			}

			// メッセージ送信を試みる
			const sendMessageWithRetry = async (retryCount = 0) => {
				try {
					const response = await new Promise((resolve, reject) => {
						chrome.runtime.sendMessage(event.data, (response) => {
							if (chrome.runtime.lastError) {
								reject(new Error(chrome.runtime.lastError.message))
							} else {
								resolve(response)
							}
						})
					})

					window.postMessage(
						{
							source: 'startup-extension',
							...response,
						},
						'*',
					)
				} catch (error) {
					if (
						(error.message.includes('Extension context invalidated') ||
							error.message.includes('message port closed')) &&
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
				} finally {
					isProcessingMessage = false
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
		isProcessingMessage = false
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

// 拡張機能の準備完了を通知
try {
	chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn(
				'Failed to notify content script ready:',
				chrome.runtime.lastError.message,
			)
		}
	})
} catch (error) {
	console.warn('Failed to send content script ready message:', error)
}
