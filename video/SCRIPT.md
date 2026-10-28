# Leakscope demo video: narration script

Generated from `scenes.mjs` by `script.mjs`; edit the scenes file, not this one.

Each numbered line is one caption and one narration take. The video is cut to the length of each
take, so you can re-record in your own voice without re-timing anything:

1. Record each line as its own file: `build/tts/<scene>-<n>.wav` (names below, n starts at 0).
   Leave about a quarter second of silence at the end of each take.
2. Run `SKIP_TTS=1 ./make.sh`. The screen recording is redone with your take lengths.

Spoken text differs from the caption only where numbers or names need to be read aloud
(for example "two point five zero one two one Z E C"); read whichever feels natural.

## 1. The problem (about 20 s)

On screen: `/`

1. **intro-0.wav**: Zcash's shielded pools are a vault. Inside, sender, receiver and amount are hidden.
   - *spoken:* Zee-cash's shielded pools are a vault. Inside, the sender, receiver and amount are hidden.
2. **intro-1.wav**: But the vault has doors, and the doors are public.
3. **intro-2.wav**: Every shielding, deshielding and pool crossing puts an exact amount, an address and a time on the chain.
4. **intro-3.wav**: Leakscope shows you what an observer learns at those doors, before you walk through them.

## 2. Observatory (about 35 s)

On screen: `/`

1. **observatory-0.wav**: This is the observatory: 75 days of mainnet since the Ironwood pool launched. 584,497 transactions.
   - *spoken:* This is the observatory. Seventy-five days of mainnet since the Ironwood pool launched. Five hundred eighty-four thousand transactions.
2. **observatory-1.wav**: Leakscope models an observer with nothing but the public chain. And yet: 24.6% of withdrawals from the shielded pools can be traced.
   - *spoken:* Leakscope models an observer with nothing but the public chain. And yet, twenty-four point six percent of withdrawals from the shielded pools can be traced.
3. **observatory-2.wav**: Back to the deposit they came from, or forward to where they were re-shielded. Every orange thread is one such link.
4. **observatory-3.wav**: Someone shielded 2.50121076 ZEC. Nine minutes later 2.50106076 ZEC came out: the same amount, minus the 15,000 zatoshi fee.
   - *spoken:* Here, someone shielded two point five zero one two one Z E C. Nine minutes later, two point five zero one zero six came out. The same amount, minus the fifteen-thousand zatoshi fee.

## 3. Check a transaction (about 25 s)

On screen: `/check/`

1. **check-0.wav**: Check takes any mainnet transaction id and shows what anyone can see about it.
   - *spoken:* Check takes any mainnet transaction I.D., and shows what anyone can see about it.
2. **check-1.wav**: This withdrawal matches exactly one earlier deposit, 7 blocks before. Anonymity set: one. Fully linked.
   - *spoken:* This withdrawal matches exactly one earlier deposit, seven blocks before. Anonymity set: one. Fully linked.
3. **check-2.wav**: Measured on mainnet, links of this kind are right about 99% of the time. No cryptography is broken; only amounts are matched.
   - *spoken:* Measured on mainnet, links of this kind are right about ninety-nine percent of the time. No cryptography is broken. Only amounts are matched.
4. **check-3.wav**: The lookup is private too: the transaction id never leaves your tab.
   - *spoken:* The lookup is private too. The transaction I.D. never leaves your tab.

## 4. Pre-flight (about 32 s)

On screen: `/plan/`

1. **plan-0.wav**: Pre-flight checks a transfer before you make it. Nothing is sent.
2. **plan-1.wav**: Say you want to withdraw 7.7 ZEC from Ironwood to an exchange.
   - *spoken:* Say you want to withdraw seven point seven Z E C, from Ironwood to an exchange.
3. **plan-2.wav**: Only one other recent transfer used that amount: easy to single out. Privacy score: 25 out of 100.
   - *spoken:* Only one other recent transfer used that amount. Easy to single out. Privacy score: twenty-five, out of a hundred.
4. **plan-3.wav**: The suggestion: split it into standard ZIP-318 denominations that every compliant wallet uses, broadcast at random intervals.
   - *spoken:* The suggestion: split it into standard zip three-eighteen denominations, that every compliant wallet uses, and broadcast them at random intervals.
5. **plan-4.wav**: Each part now hides among hundreds of look-alikes, and the schedule breaks timing correlation too.
   - *spoken:* Each part now hides among hundreds of look-alikes, and the random schedule breaks timing correlation too.

## 5. Scan a wallet (about 31 s)

On screen: `/scan/`

1. **scan-0.wav**: Scan finds the leaks in your own wallet. Paste a viewing key; here, a testnet demo key.
2. **scan-1.wav**: A WebAssembly scanner trial-decrypts compact blocks on this device. The key never leaves the browser.
   - *spoken:* A WebAssembly scanner trial-decrypts compact blocks, right on this device. The key never leaves the browser.
3. **scan-2.wav**: The block server learns only the height range, not which transactions are yours.
4. **scan-3.wav**: The personal leak report: what an outside observer can link, transaction by transaction.
5. **scan-4.wav**: Here, coins were deshielded and immediately re-shielded: a critical round trip, linked with certainty.

## 6. Method and accuracy (about 21 s)

On screen: `/method/`

1. **method-0.wav**: How do we know a link is real? A unique match could still be a coincidence.
2. **method-1.wav**: So we run the exact same rule backwards in time. Money can't leave before it arrives, so every backward match is a coincidence.
3. **method-2.wav**: That measures the false-link rate on the real chain. The fastest tier is about 99% precise, and rules that failed the test were dropped.
   - *spoken:* That measures the false-link rate on the real chain. The fastest tier is about ninety-nine percent precise, and rules that failed the test were dropped.

## 7. For users and wallet developers (about 15 s)

On screen: `/`

1. **outro-0.wav**: Leakscope is for Zcash users, who can check before they send, and for wallet developers, through the @leakscope/engine SDK.
   - *spoken:* Leakscope is for Zee-cash users, who can check before they send. And for wallet developers, through the leakscope engine S.D.K.
2. **outro-1.wav**: It's open source. Try it at leakscope-cyan.vercel.app.
   - *spoken:* It's open source. Try it at leakscope dash cyan, dot vercel dot app.

Total: about 2 min 58 s.
