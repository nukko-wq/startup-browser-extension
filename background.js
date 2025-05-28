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

// メッセージ処理を共通化する関数
async function handleMessage(message, sendResponse) {
	try {
		switch (message.type) {
			case 'REQUEST_TABS_UPDATE': {
				const tabs = await getAllTabs()
				sendResponse({ success: true, tabs })
				return true
			}

			case 'SWITCH_TO_TAB': {
				await chrome.tabs.update(message.tabId, { active: true })
				sendResponse({ success: true })
				return true
			}

			case 'CLOSE_TAB': {
				await chrome.tabs.remove(message.tabId)
				sendResponse({ success: true })
				return true
			}

			case 'SET_TOKEN': {
				await chrome.storage.local.set({ token: message.token })
				sendResponse({ success: true })
				return true
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

				const tabsToClose = allTabs.filter((tab) => tab.id !== currentTab[0].id)
				if (tabsToClose.length > 0) {
					await chrome.tabs.remove(tabsToClose.map((tab) => tab.id))
				}
				sendResponse({ success: true })
				return true
			}

			case 'SORT_TABS_BY_DOMAIN': {
				try {
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

					// タブの位置を順次更新
					const movePromises = sortedTabs.map((tab, index) =>
						chrome.tabs.move(tab.id, { index }),
					)
					await Promise.all(movePromises)

					sendResponse({ success: true })
				} catch (error) {
					console.error('Error in SORT_TABS_BY_DOMAIN:', error)
					sendResponse({
						success: false,
						error: error.message || 'Failed to sort tabs',
					})
				}
				return true
			}

			case 'FIND_OR_CREATE_STARTUP_TAB': {
				// 既存のStartupタブを探す
				const tabs = await chrome.tabs.query({
					url: ['https://startup.nukko.dev/*'],
				})

				if (tabs.length > 0) {
					// 既存のタブがある場合はそれをアクティブにする
					await chrome.tabs.update(tabs[0].id, { active: true })
					sendResponse({ success: true, tabId: tabs[0].id })
				} else {
					// 新しいタブを作成
					const newTab = await chrome.tabs.create({
						url: 'https://startup.nukko.dev/',
						active: true,
					})
					sendResponse({ success: true, tabId: newTab.id })
				}
				return true
			}

			case 'OPEN_TAB_AT_END': {
				// タブの一番右側に新規タブを開く
				const currentWindow = await chrome.windows.getCurrent()
				const allTabs = await chrome.tabs.query({
					windowId: currentWindow.id,
				})

				const newTab = await chrome.tabs.create({
					url: message.url,
					active: true,
					index: allTabs.length, // 一番右側に配置
				})
				sendResponse({ success: true, tabId: newTab.id })
				return true
			}

			case 'SHOW_SPACE_LIST_OVERLAY': {
				// content scriptにオーバーレイ表示を指示
				const tabs = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				})
				if (tabs[0]) {
					try {
						await chrome.tabs.sendMessage(tabs[0].id, {
							type: 'SHOW_SPACE_LIST_OVERLAY',
						})
						sendResponse({ success: true })
					} catch (error) {
						console.error('Error sending message to content script:', error)
						sendResponse({ success: false, error: error.message })
					}
				} else {
					sendResponse({ success: false, error: 'No active tab found' })
				}
				return true
			}

			case 'PING': {
				// 拡張機能の生存確認用
				sendResponse({ success: true })
				return true
			}

			case 'CONTENT_SCRIPT_READY': {
				// content scriptの準備完了通知
				sendResponse({ success: true })
				return true
			}

			default:
				sendResponse({ success: false, error: 'Unknown message type' })
				return true
		}
	} catch (error) {
		console.error('Error in handleMessage:', error)
		sendResponse({ success: false, error: error.message })
		return true
	}
}

// 内部メッセージ（content scriptから）を処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// 非同期処理を適切に処理
	const result = handleMessage(message, sendResponse)
	if (result instanceof Promise) {
		result.catch((error) => {
			console.error('Error handling message:', error)
			sendResponse({
				success: false,
				error: error.message || 'Unknown error occurred',
			})
		})
	}
	return true // 非同期レスポンスを使用することを示す
})

// 外部メッセージ（Webアプリから直接）を処理
chrome.runtime.onMessageExternal.addListener(
	(message, sender, sendResponse) => {
		// 非同期処理を適切に処理
		const result = handleMessage(message, sendResponse)
		if (result instanceof Promise) {
			result.catch((error) => {
				console.error('Error handling external message:', error)
				sendResponse({
					success: false,
					error: error.message || 'Unknown error occurred',
				})
			})
		}
		return true // 非同期レスポンスを使用することを示す
	},
)

// Webアプリへの通知を共通化
async function notifyTabsUpdate() {
	try {
		const tabs = await getAllTabs()
		const matchingTabs = await chrome.tabs.query({
			url: ['https://startup.nukko.dev/*'],
		})

		for (const tab of matchingTabs) {
			try {
				const tabInfo = await chrome.tabs.get(tab.id)
				// タブが有効で、エラーページでないことを確認
				if (tabInfo && !tabInfo.url.startsWith('chrome-error://')) {
					// メッセージ送信時のエラーを適切に処理
					try {
						await chrome.tabs.sendMessage(tab.id, {
							type: 'TABS_UPDATED',
							tabs: tabs,
						})
					} catch (error) {
						// 接続エラーは無視して続行
						if (!error.message.includes('Receiving end does not exist')) {
							console.error(`Tab ${tab.id} への更新送信エラー:`, error)
						}
					}
				}
			} catch (error) {
				console.error('タブ情報の取得エラー:', error)
			}
		}
	} catch (error) {
		console.error('notifyTabsUpdateでのエラー:', error)
	}
}

// タブの変更を監視
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		notifyTabsUpdate()
	}
})

chrome.tabs.onRemoved.addListener(() => {
	notifyTabsUpdate()
})

chrome.tabs.onMoved.addListener(() => {
	notifyTabsUpdate()
})

// キーボードショートカットの登録
chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'show_space_list') {
		try {
			// まずStartupタブを表示
			await new Promise((resolve) => {
				handleMessage({ type: 'FIND_OR_CREATE_STARTUP_TAB' }, resolve)
			})
			// 少し待ってからオーバーレイを表示
			setTimeout(async () => {
				await new Promise((resolve) => {
					handleMessage({ type: 'SHOW_SPACE_LIST_OVERLAY' }, resolve)
				})
			}, 500)
		} catch (error) {
			console.error('Error showing space list:', error)
		}
	}
})
