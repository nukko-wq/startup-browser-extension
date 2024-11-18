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

// メッセージリスナーを修正
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.type === 'GET_EXTENSION_ID') {
		sendResponse({ success: true, extensionId: chrome.runtime.id })
		return true
	}
})

chrome.runtime.onMessageExternal.addListener(
	async (request, sender, sendResponse) => {
		console.log('Received message:', request, 'from:', sender)
		try {
			switch (request.type) {
				case 'GET_EXTENSION_ID': {
					sendResponse({ success: true, extensionId: chrome.runtime.id })
					break
				}

				case 'GET_CURRENT_TABS': {
					const tabs = await chrome.tabs.query({ currentWindow: true })
					const formattedTabs = tabs.map((tab) => ({
						id: tab.id,
						title: tab.title || '',
						url: tab.url || '',
						faviconUrl: tab.favIconUrl || '',
					}))
					sendResponse(formattedTabs)
					break
				}

				case 'ACTIVATE_TAB': {
					const tab = await chrome.tabs.get(request.tabId)
					if (tab?.windowId) {
						await chrome.tabs.update(request.tabId, { active: true })
						await chrome.windows.update(tab.windowId, { focused: true })
						sendResponse({ success: true })
					}
					break
				}

				case 'CLOSE_TAB': {
					await chrome.tabs.remove(request.tabId)
					sendResponse({ success: true })
					break
				}

				case 'PING': {
					sendResponse({ success: true })
					break
				}
			}
		} catch (error) {
			console.error('Error in message handling:', error)
			sendResponse({ success: false, error: String(error) })
		}
		return true // 非同期レスポンスのために必要
	},
)
