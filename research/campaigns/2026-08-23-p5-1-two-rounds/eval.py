import json, random, sys
argv = sys.argv[1:]
feature = argv[argv.index('--feature') + 1] if '--feature' in argv else 'none'
shuffle = '--shuffle' in argv
rng = random.Random(42)
n = 200
noise = random.Random(99)
xs = [rng.random() for _ in range(n)]
labels = [1 if x + noise.uniform(-0.12, 0.12) > 0.5 else 0 for x in xs]
if shuffle:
    random.Random(7).shuffle(labels)
correct = 0
for i, (x, label) in enumerate(zip(xs, labels)):
    if feature == 'pca':
        pred = 1 if x > 0.5 else 0
    else:
        pred = 1 if random.Random(i).random() > 0.5 else 0
    correct += pred == label
print(json.dumps({'metric': {'accuracy': round(correct / n, 4)}}))
