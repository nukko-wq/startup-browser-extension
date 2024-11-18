import { Storage } from '@plasmohq/storage'

const storage = new Storage()

// 起動時に拡張機能のIDを保存
const saveExtensionId = async () => {
	const extensionId = chrome.runtime.id
	await storage.set('extensionId', extensionId)
	console.log('Extension ID saved:', extensionId)
}

// 初期化時にIDを保存
saveExtensionId()

// メッセージ処理の共有関数
const handleMessage = (request, sender, sendResponse) => {
	console.log('Received message:', request, 'from:', sender)

	try {
		switch (request.type) {
			case 'PING':
				sendResponse({ success: true })
				return true

			case 'GET_CURRENT_TABS':
				chrome.tabs.query({ currentWindow: true }, (tabs) => {
					const formattedTabs = tabs.map((tab) => ({
						id: tab.id,
						title: tab.title || '',
						url: tab.url || '',
						faviconUrl: tab.favIconUrl || '',
					}))
					sendResponse(formattedTabs)
				})
				return true

			default:
				sendResponse({ success: false, error: 'Unknown message type' })
				return true
		}
	} catch (error) {
		console.error('Error handling message:', error)
		sendResponse({ success: false, error: String(error) })
		return true
	}
}

// 内部メッセージハンドラ
chrome.runtime.onMessage.addListener(handleMessage)

// 外部メッセージハンドラ
chrome.runtime.onMessageExternal.addListener(handleMessage)
