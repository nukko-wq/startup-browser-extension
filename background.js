// タブ情報を整形する関数
function formatTab(tab) {
	return {
		id: tab.id,
		title: tab.title,
		url: tab.url,
		faviconUrl: tab.favIconUrl,
		pinned: tab.pinned,
	}
}

// 現在のWindowのタブ情報を取得（ピン留めされていないタブのみ）
async function getAllTabs() {
	const currentWindow = await chrome.windows.getCurrent()
	const tabs = await chrome.tabs.query({
		windowId: currentWindow.id,
		pinned: false,
	})
	return tabs.map(formatTab)
}

// メッセージリスナーの設定
chrome.runtime.onMessageExternal.addListener(
	(message, sender, sendResponse) => {
		;(async () => {
			try {
				switch (message.type) {
					case 'REQUEST_TABS_UPDATE': {
						const tabs = await getAllTabs()
						sendResponse({ success: true, tabs })
						return
					}

					case 'SWITCH_TO_TAB': {
						await chrome.tabs.update(message.tabId, { active: true })
						sendResponse({ success: true })
						return
					}

					case 'CLOSE_TAB': {
						await chrome.tabs.remove(message.tabId)
						sendResponse({ success: true })
						return
					}

					case 'SET_TOKEN': {
						// トークンを保存
						await chrome.storage.local.set({ token: message.token })
						sendResponse({ success: true })
						return
					}

					default:
						sendResponse({ success: false, error: 'Unknown message type' })
						return
				}
			} catch (error) {
				sendResponse({ success: false, error: error.message })
			}
		})()
		return true
	},
)

// タブの変更を監視し、Webアプリに通知
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		const tabs = await getAllTabs()
		// 登録されているWebアプリにメッセージを送信
		chrome.tabs.query(
			{ url: ['http://localhost:3000/*', 'https://startup.nukko.dev/*'] },
			async (matchingTabs) => {
				for (const tab of matchingTabs) {
					try {
						// content scriptが読み込まれているか確認
						await chrome.scripting.executeScript({
							target: { tabId: tab.id },
							func: (tabsData) => {
								window.postMessage(
									{
										source: 'startup-extension',
										type: 'TABS_UPDATED',
										tabs: tabsData,
									},
									'*',
								)
							},
							args: [tabs],
						})
					} catch (error) {
						console.error('Error executing script:', error)
					}
				}
			},
		)
	}
})
