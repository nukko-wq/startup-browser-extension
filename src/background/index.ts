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
					const formattedTabs = tabs
						.filter((tab) => !tab.pinned)
						.map((tab) => ({
							id: tab.id,
							title: tab.title || '',
							url: tab.url || '',
							faviconUrl: tab.favIconUrl || '',
						}))
					console.log('Sending tabs:', formattedTabs)
					sendResponse(formattedTabs)
				})
				return true

			case 'CLOSE_TAB':
				chrome.tabs.remove(request.tabId, () => {
					sendResponse({ success: true })
				})
				return true

			case 'SWITCH_TO_TAB':
				chrome.tabs.get(request.tabId, (tab) => {
					if (chrome.runtime.lastError) {
						console.error(chrome.runtime.lastError)
						sendResponse({
							success: false,
							error: chrome.runtime.lastError.message,
						})
						return
					}

					chrome.windows.update(tab.windowId, { focused: true }, () => {
						if (chrome.runtime.lastError) {
							console.error(chrome.runtime.lastError)
							sendResponse({
								success: false,
								error: chrome.runtime.lastError.message,
							})
							return
						}

						chrome.tabs.update(request.tabId, { active: true }, () => {
							if (chrome.runtime.lastError) {
								console.error(chrome.runtime.lastError)
								sendResponse({
									success: false,
									error: chrome.runtime.lastError.message,
								})
								return
							}
							sendResponse({ success: true })
						})
					})
				})
				return true

			case 'CLOSE_ALL_TABS':
				chrome.tabs.query({ pinned: false, currentWindow: true }, (tabs) => {
					const tabIds = tabs
						.map((tab) => tab.id)
						.filter((id): id is number => id !== undefined)
					chrome.tabs.remove(tabIds, () => {
						sendResponse({ success: true })
					})
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

// 全てのタブの情報を取得して接続されているクライアントに送信
const broadcastTabUpdate = async () => {
	try {
		const tabs = await chrome.tabs.query({ currentWindow: true })
		const formattedTabs = tabs
			.filter((tab) => !tab.pinned)
			.map((tab) => ({
				id: tab.id,
				title: tab.title || '',
				url: tab.url || '',
				faviconUrl: tab.favIconUrl || '',
			}))

		// nukko.devドメインのタブを探す
		const targetTabs = await chrome.tabs.query({
			url: ['*://*.nukko.dev/*', 'http://localhost:3000/*'],
		})

		for (const tab of targetTabs) {
			if (tab.id) {
				try {
					await chrome.tabs.sendMessage(tab.id, {
						type: 'TABS_UPDATED',
						tabs: formattedTabs,
					})
				} catch (error) {
					console.error('Failed to send message to tab:', tab.id, error)
				}
			}
		}
	} catch (error) {
		console.error('Error in broadcastTabUpdate:', error)
	}
}

// タブの変更を監視するリスナーを追加（より詳細なログを追加）
chrome.tabs.onCreated.addListener((tab) => {
	console.log('Tab created:', tab)
	setTimeout(broadcastTabUpdate, 500)
})
chrome.tabs.onRemoved.addListener((tabId) => {
	console.log('Tab removed:', tabId)
	setTimeout(broadcastTabUpdate, 100)
})
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	console.log('Tab updated:', tabId, changeInfo)
	if (changeInfo.status === 'complete') {
		setTimeout(broadcastTabUpdate, 100)
	}
})
