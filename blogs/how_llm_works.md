## LLMs and Its Working

### Disclaimer
I'm running [IBM Granite4.2:3b](https://ollama.com/library/granite4.2:3b) LLM locally via Ollama.

### Terminologies
1. Prefill - The phase where LLMs understand the inputs.
2. Decode - The phase where LLMs generate outputs
3. KV Pair - Key Value pair in self attention mechanism.
4. LLM - Large Language Model

### What I am trying to achieve?
I'm trying to understand a high level flow of how LLM receives user input and generate output. As there are a lot of nuances about tokens, how it gets calculated, how it is affecting cost and so on. The whole blog covers what I understood.

### What is a LLM?
A Large Language Model is a neural network trained on massive amounts of text data. It learns patterns in language — grammar, facts, reasoning, tone — by predicting the next word over billions of examples. Once trained, it can generate human-like text, answer questions, summarize documents, write code, and more. It's "large" because of the sheer number of parameters (learned weights) it contains — Granite 4.2:3b has 3 billion of them.

### How it Works?
You have heard that tokens are expensive, C company used all its token and blah blah but **what are tokens**?
Before understanding token let's understand what a LLM receives as input when a user queries.

Generally, there are two types of prompts:
- System Prompt: These are prompt are written that tells LLM what they are and how they have to act. The below prompt tells LLM to ignore queries which are not related to Infrastructure. These are basically invisible to Users.
  - "You are a DevOps engineer, troubleshoot devs queries. If anything asked that are not related to DevOps, Cloud, SRE, mention you are a DevOps assistent and cannot help with their query."
  - "You are a helpful assistant with access to tools. Use the tools when the user's question requires them. Otherwise, answer directly from your knowledge."

- User Prompt: This is what user passes to the LLM.
  - Explain me MCP
  - Solve this maths problem?
  - How to cook maggie?


As soon as user hits enter, LLM receives System Prompt + User Prompt as a single Prompt.

**Example:**
```text
<|im_start|>system
You are a helpful assistant with access to tools. Use the tools when the user's question requires them. Otherwise, answer directly from your knowledge.<|im_end|>
<|im_start|>user
what is LLM?<|im_end|>
<|im_start|>assistant

<think>
The user asks "what is LLM?" which is a simple definition question. No tool needed. I can answer directly. Provide a clear definition: Large Language Model. Maybe mention it's a type of AI that generates text based on patterns learned from large datasets. Keep it concise.
</think>
```

#### TOKENS
In simple words, while training LLMs a list of letter, words are provided with a number associated with it. Similar to ASCII where a means [97](https://www.ascii-code.com/97), A means [65](https://www.ascii-code.com/65) and so on. Similarly a json file is created with a lots of letters, words mapped to a number.

So the prompt which I have mentioned above gets converted into a list/array of numbers.

For Example - I took some token mapping for word "kubernetes", however I was not able to find the exact word. So, I gathered the similar ones. You can checkout [tokenizer.json](https://huggingface.co/ibm-granite/granite-4.2-3b/raw/main/tokenizer.json) and [tokenizer_config.json](https://huggingface.co/ibm-granite/granite-4.2-3b/blob/main/tokenizer_config.json) for Granite4.2:3b

```json
{
    "ĠKubernetes": 67474,
    "/kubernetes": 80687,
    "ubernetes": 30927,
    "K": 42,
    "k": 74,
    "\"k": 64011,
    "Ķ": 242,
    "ķ": 243,
}
```
Explanation on some sign and tags:
- "Ġ" is used as whitespace by LLM so *"ĠKubernetes"* is equivalent to *" kubernetes"*(a whitespace in start).
- **`<|tag|>`** is used by LLMs to differentiate between prompts and internal token. You can check *tokenizer_config.json* for the same.

Here's a Python snippet that does the same
```python

from transformers import AutoTokenizer, AutoConfig

model = "ibm-granite/granite-4.2-3b"

tokenizer = AutoTokenizer.from_pretrained(model)

def tokenize_list_of_text():
    texts = [
        "kubernetes",
        "Kubernetes Kubernetes",
        "Kubernetes Cluster status"
    ]
    for text in texts:
        tokens = tokenizer.tokenize(text)
        token_ids = tokenizer.encode(text)
        print(text, "-->", tokens, '-->', len(tokens))
```

```text
kubernetes --> ['k', 'ubernetes'] --> 2 --> [74, 30927]
Kubernetes Kubernetes --> ['K', 'ubernetes', 'ĠKubernetes'] --> 3 --> [42, 30927, 67474]
Kubernetes Cluster status --> ['K', 'ubernetes', 'ĠCluster', 'Ġstatus'] --> 4 --> [42, 30927, 36480, 2704]
```

- As I mentioned, "kubernetes" was not present as a single word in the tokenizer.json so LLM divided `k` and `ubernetes`. This is called **Byte Pair Encoding (BPE)** — the tokenizer starts with individual characters and repeatedly merges the most frequent adjacent pairs into longer tokens. The `"merges"` list in tokenizer.json is exactly that sequence of learned merge rules.
```text
merges = [
  [
        "ĠK",
        "ubernetes"
      ],
      [
        "/k",
        "ubernetes"
      ],
]
```
**Note:** Based on model and its tokenizer, the token length and numerical IDs will differ.

**Flow:** Prompt → Token numerical mapping

#### Embedding
Tokens are just numbers at this point — `42` for "K", `30927` for "ubernetes". But a plain number doesn't capture meaning. Is token `42` similar to token `30927`? You can't tell from the numbers alone.

Embeddings solve this. Each token ID gets mapped to a dense vector — a list of numbers that positions the token in a high-dimensional space where similar meanings end up close together. During training, the model learns these vectors so that tokens appearing in similar contexts get similar embeddings. For example "k" which equals to 74 in token number might have embedding [0.343457, 1.231298, 0.975467, 0.551234, ...]. The length of embedding is dependent on the model.

```python
def get_model_config():
    config = AutoConfig.from_pretrained(model)
    print("Vocabulary Size: ", config.vocab_size)
    print("Hidden Size: ", config.hidden_size)
    print("Layers: ", config.num_hidden_layers)
    print("Attention Heads: ", config.num_attention_heads)
```
```text
Vocabulary Size:  100352
Hidden Size:  2560
Layers:  40
Attention Heads:  40
```
- **Vocabulary Size:** The tokenizer has 100,352 token IDs available.
- **Hidden Size:** Each token is represented by a 2560-dimensional vector embedding.
- **Layers:** The model has 40 sequential processing layers.
- **Attention Heads:** Each layer has 40 attention heads.

- The token embedding matrix maps every token ID to a vector.
- Its expected shape is `100352 x 2560`
- That means there are 100,352 rows, each containing 2560 learned numbers.
- **When your tokenizer converts a word or subword into a token ID, the model uses that ID to retrieve its corresponding embedding vector**.

```text
Token IDs: [42, 30927]
Number of token vectors: 2
Embedding dimension per token: 2560
Token 'K' (ID 42) -> length 2560, first 5: [-0.8279586434364319, -1.3079571723937988, 4.063749313354492, -4.968265056610107, 7.593883037567139]
Token 'ubernetes' (ID 30927) -> length 2560, first 5: [-0.8720391392707825, 11.773555755615234, 3.8814187049865723, -9.402481079101562, 3.3150548934936523]
```
**Flow:** Prompt → Token numerical mapping → Embedding corresponding to Token ID

#### Positional Encoding
The embedding matrix maps each token ID to a vector based on *what* the token is — not *where* it appears. That means "The bank approved my loan" and "loan my approved bank The" would produce the exact same set of embeddings, just in a different order. Without position information, the model treats them as identical — it has no concept of word order.

**Positional encoding** solves this by adding position information to each token's embedding *before* it enters the transformer layers. The token embedding alone says "I am the word bank"; positional encoding adds "and I'm at position 2."

```
final_embedding[i] = token_embedding[i] + position_encoding[i]
```

Now "bank" at position 2 has a slightly different vector than "bank" at position 5, and the model can learn that word order matters. Granite 4.2 uses **RoPE (Rotary Position Embeddings)** — instead of adding a separate vector, it rotates the Q and K vectors by an angle proportional to their position, so the attention score naturally encodes the distance between two tokens.

**Flow:** Prompt → Token numerical mapping → Embedding corresponding to Token ID → Positional Encoding

#### Transformers
Everything up to this point — tokenization, embedding lookup, and positional encoding — is the **Prefill** phase.

[Transformers](https://poloclub.github.io/transformer-explainer/) are the core/brain of LLM. The whole LLM, GPT stuff started after transformer came out in the industry. It is a neural network architecture that allow LLMs to predict the next token. Let's understand it with a clean example.

Two statements contains a same word but its meaning is totally different. You can tell the difference as your brain can connect it with rest of the statements. 
- The bank approved my loan.
- I sat near the river bank.

And as we saw, for LLM bank would have same token ID and same embedding. It cannot tell the difference between the meaning. To solve this **transformer** comes into the picture.

As I mentioned transformer are neural network architecture, it works exactly how neurons in our brain works. It 
- read the sentences, 
- gather existing information from the memory, 
- analyze what could it mean, and 
- select the best one

To perform these action, transformer uses **Self Attention mechanism**.

##### SELF ATTENTION
In layman term, it means make sure a token is aware of its surrounding tokens. It allows tokens to exchange information with other token positions. *How it works?* Under the hood it runs Query, Key and Value mechanism.

**What is Query, Key and Value mechanism**?
We will use "The bank approved my loan." example to understand this mechanism.

The statement gets tokenized into *tokens = ["The", "Ġbank", "Ġapproved", "Ġmy", "Ġloan", "."]*

- Query (Q): What information am I looking for? (What does this token need to know?)
- Key (K): What information can I offer? What am I about? (My identity and contextual matching features)
- Value (V): What information will I actually contribute? (The content I provide to tokens that attend to me)

Every token simultaneously produces all three — a Query, a Key, and a Value. No token is special; all of them are both asking and answering at the same time.

| Token | Query | Key | Value |
|-------|-------|-----|-------|
| The | Q_the | K_the | V_the |
| bank | Q_bank | K_bank | V_bank |
| approved | Q_approved | K_approved | V_approved |
| my | Q_my | K_my | V_my |
| loan | Q_loan | K_loan | V_loan |
| . | Q_. | K_. | V_. |

Now when computing attention for "bank", its query (`Q_bank`) gets matched against *every* key — including its own:

```
Q_bank × K_the      → score
Q_bank × K_bank     → score  ← attends to itself
Q_bank × K_approved → score
Q_bank × K_my       → score
Q_bank × K_loan     → score
Q_bank × K_.        → score
```

And the same thing happens for every other token too. "The" also runs its query against all 6 keys. "loan" does the same. Every token is both asking (via Q) and answering (via K and V) at the same time.

Self-attention to itself matters because sometimes a token's own identity is the most relevant signal. Think of "I am what I am" — the second "I" needs to attend to itself and to the first "I" to understand they're co-referential.

There are 6 tokens and in `Granite4.2:3b` 40 attention heads are present. What is *attention heads?* **Attention heads** are like teeth in your mouth where each teeth will chew the food(token) you are eating. That means "bank" will be processed by all 40 heads and gets matched against different keys and its value. The Key-Value pair differs based on models, it can be equivalent to number of attention heads, or less. In current model, only 8 KV pair are there means 5 attention heads has to share one KV(Key-Value) pair.

**What is happening by matching query against keys?**
The initial embedding of token does not correlate with other tokens. Here when a query matched against KV, it generates **attention weights** and based on weights model understand which token is more related to what. Example:
- For **"bank"**, the head may give more attention to:
| key | attention weight |
| -------- | -------- |
| loan | High |
| my | Low |

**Why use so many attention heads?**
When a attention head containg query interact with a KV pair, each head try different relationship with the token and each head *generate different attention weights*. Means if 5 attention heads all containing "bank" as query matched against "loan", it might be possible one head process noun to noun relationship, other picks subject to object relationship, cause and effect and so on. Finally  embedding of "bank" gets updated and passed to another layer. In layman term, *Different heads can learn to focus on different relationships between words in the same sentence.*

**Note:** Attention scores are later converted into probabilistic values via softmax.

##### Feed Forward Network
It takes the output of Self attention phase and transforms it further. Attention tells that bank is more related to "money", "deposit" and so on. FFN processes the resulting representation. This happens on every transformer layer.

LLM has processed the inputs.

**Flow:** Prompt → Token numerical mapping → Embedding corresponding to Token ID → Positional Encoding → Transformers (Self attention via Q, K, V → FFN) → generates meaningful embeddings


#### Generate Output
This is the **Decode** phase — the model generates tokens one at a time.

**User Prompted:** What is the full form of LLM?

After processing the prompt through its Transformer layers, the model produces a set of scores called **logits** for possible next tokens.

Token? Again? Yes, whatever model output, it is also a token for it.

**Logits:** Deciding what comes next. The model's final layer produces a score for every token in its vocabulary — all 100,352 of them — in a single matrix multiplication. It doesn't search or filter; every token gets a score simultaneously. These scores are called **logits**. The highest-scoring tokens are the ones the model considers most likely to come next. Example:
| Vocabulary | Logits |
| -------- | -------- |
| Large | 8.2 |
| Long | 3.1 |
| Loose | 1.4 |
| Leg | -1.2 |

**Softmax:** The logits are then converted into probabilities that sum to 100%:
| Vocabulary | Probability |
| -------- | -------- |
| Large | 89.8% |
| Long | 5.7% |
| Loose | 3.4% |
| Leg | 1.1% |

**Sampling:** Selecting the next token. Chooses a token probabilistically but based on controls can allow less likely candidates to be selected.
Two important controls are:
- **Temperature:** It tells which candidate to select. Lower the value(< 0.3), it allows for the highest probabilistic candidate only. Higher the value, it allows low probabilistic candidate too.
- **Top-P**: Restricts sampling to the smallest group of highest probability tokens whose cumulative probability reaches the configured threshold.

Now, Large is generated but still it has to find the LM value? For this model will use "Large" token embedding and match it against KV pair and goes through same 40 transformer layer. KV pair does have cache from the previous iteration and when large gets matched, the new representation also get stored in the cache. This method is called **Autoregressive Generation** where each newly generated token becomes part of the context for predicting the next token.

> **What happens when "Large" re-enters the Transformer?**
> Q_large, K_large, and V_large are computed fresh from the "Large" embedding. K_large and V_large get appended to the KV Cache, which already holds the keys and values from all previous tokens (the entire prompt + any previously generated tokens). Then only Q_large is matched against all cached keys — the previous tokens' queries (Q_the, Q_bank, etc.) are not recomputed. Their attention was already calculated during their own step. This is the whole point of the cache — you don't redo work. Without it, every new token would require reprocessing the entire sequence, and generation would get quadratically slower as the output grows.
>
> This works because of **causal (decoder-only) attention** — each token can only attend to tokens at its position or earlier, never to future tokens. A token's K and V never change based on what comes after it, which is what makes the cache valid.

The diagram below shows the complete flow from prompt to output, including the autoregressive loop:

![LLM Flow: From Prompt to Output](blogs/llm_flow.svg)

GitHub Repo - [Superintelligence/llm](https://github.com/navsin189/superintelligence/blob/main/llm/tokernizer.py)