import { Storage } from '@plasmohq/storage'

const storage = new Storage()

chrome.runtime.onMessageExternal.addListener(
	async (request, sender, sendResponse) => {
		try {
			switch (request.type) {
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
			console.error('Error:', error)
			sendResponse({ success: false, error: String(error) })
		}
		return true // 非同期レスポンスのために必要
	},
)
