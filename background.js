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

// content.jsからのメッセージを処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
					await chrome.storage.local.set({ token: message.token })
					sendResponse({ success: true })
					return
				}

				case 'CLOSE_ALL_TABS': {
					const currentTab = await chrome.tabs.query({
						active: true,
						currentWindow: true,
					})
					const allTabs = await chrome.tabs.query({
						currentWindow: true,
						pinned: false,
					})

					const tabsToClose = allTabs.filter(
						(tab) => tab.id !== currentTab[0].id,
					)
					if (tabsToClose.length > 0) {
						await chrome.tabs.remove(tabsToClose.map((tab) => tab.id))
					}
					sendResponse({ success: true })
					return
				}

				case 'SORT_TABS_BY_DOMAIN': {
					const allTabs = await chrome.tabs.query({
						currentWindow: true,
						pinned: false,
					})

					// URLからドメインを取得する関数
					const getDomain = (url) => {
						try {
							return new URL(url).hostname
						} catch {
							return url
						}
					}

					// ドメインでソート
					const sortedTabs = allTabs.sort((a, b) => {
						const domainA = getDomain(a.url)
						const domainB = getDomain(b.url)
						return domainA.localeCompare(domainB)
					})

					// タブの位置を更新
					for (let i = 0; i < sortedTabs.length; i++) {
						await chrome.tabs.move(sortedTabs[i].id, { index: i })
					}

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
})

// 外部（Webアプリ）からのメッセージを処理
chrome.runtime.onMessageExternal.addListener(
	(message, sender, sendResponse) => {
		// 同じ処理を実行
		chrome.runtime.onMessage.addListener(message, sender, sendResponse)
		return true
	},
)

// タブの変更を監視し、Webアプリに通知
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		await notifyTabsUpdate()
	}
})

// タブの移動を監視し、Webアプリに通知
chrome.tabs.onMoved.addListener(async () => {
	await notifyTabsUpdate()
})

// Webアプリへの通知を共通化
async function notifyTabsUpdate() {
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
