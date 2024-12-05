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

// 現在のWindowのタブ情報を取得
async function getAllTabs() {
	const currentWindow = await chrome.windows.getCurrent()
	const tabs = await chrome.tabs.query({ windowId: currentWindow.id })
	return tabs.map(formatTab)
}

// メッセージリスナーの設定
chrome.runtime.onMessageExternal.addListener(
	async (message, sender, sendResponse) => {
		try {
			switch (message.type) {
				case 'REQUEST_TABS_UPDATE': {
					const tabs = await getAllTabs()
					sendResponse({ success: true, tabs })
					break
				}

				case 'SWITCH_TO_TAB':
					await chrome.tabs.update(message.tabId, { active: true })
					sendResponse({ success: true })
					break

				case 'CLOSE_TAB':
					await chrome.tabs.remove(message.tabId)
					sendResponse({ success: true })
					break

				// 他のアクションはここに追加
			}
		} catch (error) {
			sendResponse({ success: false, error: error.message })
		}
		return true // 非同期レスポンスのために必要
	},
)

// タブの変更を監視し、Webアプリに通知
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		const tabs = await getAllTabs()
		// 登録されているWebアプリにメッセージを送信
		chrome.tabs.query(
			{ url: ['http://localhost:3000/*', 'https://startup.nukko.dev/*'] },
			(matchingTabs) => {
				for (const tab of matchingTabs) {
					tab.postMessage(
						{
							source: 'startup-extension',
							type: 'TABS_UPDATED',
							tabs,
						},
						'*',
					)
				}
			},
		)
	}
})
