# Task 5.2 対応計画: ブーメランジェスチャー状態機械の抽出

日付: 2026-06-11 / ブランチ: refactor/phase-5-kotlin

## 対象コードの臭い

- **長いメソッド**: `MainActivity.dispatchTouchEvent`（約115行）が Activity の責務とジェスチャー検出の責務を併せ持つ
- **データの群れ**: `lGesturePhase` / `lGestureStartX` / `lGestureStartY` / `lGestureExtremeX` / `lGestureReverseDir` / `lVelocityTracker` / `lastTap*` の9フィールドが常にセットで使われる
- **テスト不能**: Activity に埋め込まれているため状態遷移の単体テストが書けない

## 適用するリファクタリング

**クラスの抽出（Extract Class）** + **委譲（Delegate）**

`BoomerangGestureDetector` を新設し、状態機械を移動。`MainActivity.dispatchTouchEvent` は委譲のみ。
JNI 呼び出し対象のメソッドではないため proguard-rules.pro の変更は不要。

## テスト戦略（プランからの設計調整）

実装プラン（docs/superpowers/plans/2026-06-10-full-refactoring.md Task 5.2）の
`onTouchEvent(ev: MotionEvent)` インターフェイスは維持するが、unit test で
android.jar スタブが使えない問題に対応するため以下を注入可能にする:

- `velocityTrackerProvider: () -> VelocityTracker`（既定: `VelocityTracker.obtain()`）
- `now: () -> Long`（既定: `System.currentTimeMillis`、ダブルタップ間隔判定用）

テストは mockito-kotlin で `MotionEvent` / `VelocityTracker` をモックする。
`Log.d` は `testOptions.unitTests.isReturnDefaultValues = true` で no-op 化する。

## 手順（各ステップ後にテスト実行）

1. build.gradle.kts に mockito-kotlin / returnDefaultValues を追加 → 既存テストGreen確認
2. BoomerangGestureDetector + 特性テスト（characterization test）を作成 → Green
   - 左引き→右リリース（十分な速度）で onSwipeNavigate("right")
   - 右引き→左リリースで onSwipeNavigate("left")
   - FORWARD到達時に onSwipeProgress、速度不足リリースで onSwipeCancel
   - 縦移動でCANCELLED（何も発火しない）
   - 2回タップで onDoubleTap、間隔超過なら発火しない
   - isGestureBlocked=true なら MOVE でキャンセル、ダブルタップも不発火
3. MainActivity を委譲に置換（フィールド9個と enum を削除） → Green
4. format / testDebugUnitTest / リリースビルド → コミット

## 振る舞い不変の確認ポイント

- しきい値: minReverse=30dp, minForward=30dp, minVelocity=300px/s, doubleTap=300ms/50dp
- ポップアップ表示中（isGestureBlocked）は MOVE で CANCELLED、タップ検出もスキップ
- REVERSE フェーズでのリリースは progress 未発行のため onSwipeCancel を呼ばない
- ダブルタップ成立後は lastTapTime をリセット（3連タップで2回発火しない）
