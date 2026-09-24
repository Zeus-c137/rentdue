# RULES — Cyclomatic Complexity & Structural Limits (TypeScript)

These limits are hard constraints, enforced by Step 3 (Adversarial Reviewer). They apply to every function/method in `.ts` and `.tsx` files, including React components and Express route handlers.

---

## 1. NUMERIC LIMITS

| Metric | Limit | Notes |
|---|---|---|
| Cyclomatic Complexity (CC) | ≤ 8 | Per function/method, including arrow functions assigned to a variable |
| Maximum nesting/indentation depth | ≤ 3 | Counting from the function body as depth 0 |
| Maximum function length | ≤ 30 lines | Excluding blank lines and comment-only lines; includes signature to closing brace |

A function exceeding **any one** of these is an automatic reject from Step 3. There is no averaging across a file — each function is judged independently.

---

## 2. WHAT INCREMENTS CYCLOMATIC COMPLEXITY

Start every function at a base complexity of **1**. Add **+1** for each of the following:

- `if`
- `else if`
- `case` in a `switch` (each case label, not the `switch` keyword itself; `default` does not count)
- `for`, `for...of`, `for...in`
- `while`, `do...while`
- `catch`
- Each `&&` or `||` used as a branching/short-circuit operator within a condition
- `??` (nullish coalescing) when used to select between two execution paths
- Each `?` in a ternary expression (including chained ternaries — each `?` counts separately)
- Optional chaining `?.` **only** when it gates a subsequent side-effecting operation (not when used as pure safe-navigation on a read)
- Each `throw` inside a conditional branch (not a single unconditional throw)
- Recursive call sites that introduce a new conditional exit path

**Do NOT count:**
- The function declaration itself
- A single unconditional `return`
- Object/array literals, destructuring, spread syntax
- Type annotations, generics, interfaces
- A single `try` block with a single `catch` counts as +1 total (from the `catch`), not +2

### Example calculation

```typescript
function getShippingLabel(order: Order): string {
  if (!order) return 'unknown';               // +1 (if)
  if (order.isExpress && order.isInternational) { // +1 (if) +1 (&&)
    return 'express-intl';
  }
  switch (order.status) {                      // switch itself: +0
    case 'pending': return 'pending';           // +1 (case)
    case 'shipped': return 'shipped';           // +1 (case)
    default: return 'unknown';                  // default: +0
  }
}
// Base 1 + 1 + 1 + 1 + 1 + 1 = CC 6 → PASS (≤8)
```

---

## 3. NESTING DEPTH RULE

Depth is measured by counting nested control-flow blocks (`if`, `for`, `while`, `switch`, callback bodies used as control flow) inside the function body. Depth 0 = function body itself.

```typescript
function example() {          // depth 0
  if (a) {                    // depth 1
    for (const x of list) {   // depth 2
      if (x.valid) {          // depth 3 — AT LIMIT
        if (x.ready) {        // depth 4 — VIOLATION
          doThing(x);
        }
      }
    }
  }
}
```

Any function hitting depth 4+ must be refactored using the patterns in Section 4 before it can pass review.

---

## 4. REQUIRED REFACTORING PATTERNS

### 4.1 Replace nested if/else-if chains with a lookup `Record`

**❌ Reject this:**
```typescript
function getDiscountRate(tier: string): number {
  if (tier === 'bronze') {
    return 0.05;
  } else if (tier === 'silver') {
    return 0.1;
  } else if (tier === 'gold') {
    return 0.15;
  } else if (tier === 'platinum') {
    return 0.2;
  } else {
    return 0;
  }
}
// CC = 5, and grows with every new tier
```

**✅ Require this instead:**
```typescript
const DISCOUNT_RATES: Record<string, number> = {
  bronze: 0.05,
  silver: 0.1,
  gold: 0.15,
  platinum: 0.2,
};

function getDiscountRate(tier: string): number {
  return DISCOUNT_RATES[tier] ?? 0;
}
// CC = 1, flat and extensible without adding branches
```

### 4.2 Replace nested conditionals with flat guard clauses

**❌ Reject this:**
```typescript
function processOrder(order: Order): Result {
  if (order) {
    if (order.isPaid) {
      if (order.items.length > 0) {
        return ship(order);
      } else {
        return { error: 'empty order' };
      }
    } else {
      return { error: 'not paid' };
    }
  } else {
    return { error: 'no order' };
  }
}
// Depth 4, CC 4, hard to scan
```

**✅ Require this instead:**
```typescript
function processOrder(order: Order): Result {
  if (!order) return { error: 'no order' };
  if (!order.isPaid) return { error: 'not paid' };
  if (order.items.length === 0) return { error: 'empty order' };

  return ship(order);
}
// Depth 1, CC 4 but flat and linear — always prefer this shape
```

### 4.3 Replace chained ternaries with a lookup or early returns

**❌ Reject this:**
```typescript
const label = status === 'pending' ? 'Pending'
  : status === 'shipped' ? 'Shipped'
  : status === 'delivered' ? 'Delivered'
  : 'Unknown';
```

**✅ Require this instead:**
```typescript
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const label = STATUS_LABELS[status] ?? 'Unknown';
```

### 4.4 Replace `switch` with a lookup of functions when branches do real work

**❌ Reject this:**
```typescript
function handleAction(action: Action) {
  switch (action.type) {
    case 'CREATE':
      validateCreate(action);
      persistCreate(action);
      notifyCreate(action);
      break;
    case 'UPDATE':
      validateUpdate(action);
      persistUpdate(action);
      break;
    // ... grows unbounded, each case raises CC by 1
  }
}
```

**✅ Require this instead:**
```typescript
const ACTION_HANDLERS: Record<string, (action: Action) => void> = {
  CREATE: (action) => { validateCreate(action); persistCreate(action); notifyCreate(action); },
  UPDATE: (action) => { validateUpdate(action); persistUpdate(action); },
};

function handleAction(action: Action) {
  const handler = ACTION_HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action type: ${action.type}`);
  handler(action);
}
// CC = 2 regardless of how many action types exist
```

### 4.5 Extract nested loop bodies into named shared functions

**❌ Reject this:**
```typescript
function summarize(orders: Order[]) {
  for (const order of orders) {           // depth 1
    for (const item of order.items) {     // depth 2
      if (item.taxable) {                 // depth 3
        if (item.category === 'luxury') { // depth 4 — VIOLATION
          applyLuxuryTax(item);
        }
      }
    }
  }
}
```

**✅ Require this instead:**
```typescript
function applyTaxIfNeeded(item: Item): void {
  if (!item.taxable) return;
  if (item.category !== 'luxury') return;
  applyLuxuryTax(item);
}

function summarize(orders: Order[]) {
  for (const order of orders) {
    order.items.forEach(applyTaxIfNeeded);
  }
}
// Max depth now 2, each function individually simple and independently testable
```

### 4.6 Express route handlers: extract logic out of the handler body

**❌ Reject this:**
```typescript
app.post('/orders', async (req, res) => {
  if (!req.body.userId) return res.status(400).json({ error: 'missing userId' });
  if (!req.body.items || req.body.items.length === 0) return res.status(400).json({ error: 'missing items' });
  try {
    const order = await db.orders.create(req.body);
    if (order.total > 1000) {
      await notifyFraudTeam(order);
    }
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});
```

**✅ Require this instead:**
```typescript
// backend/src/shared/validators/orderValidators.ts
export function validateCreateOrderPayload(body: unknown): string | null { /* ... */ }

// backend/src/control-plane/orderService.ts (control-plane is this repo's services layer)
export async function createOrder(payload: CreateOrderInput): Promise<Order> { /* ... */ }

// backend/src/dashboard-api/routes/orders.ts
app.post('/orders', async (req, res) => {
  const validationError = validateCreateOrderPayload(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const order = await createOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});
// Handler stays thin; business logic lives in a shared, testable service
```

---

## 5. REACT + TANSTACK FRONTEND — STACK-SPECIFIC PATTERNS

The numeric limits (CC ≤ 8, depth ≤ 3, ≤ 30 lines) apply per-component and
per-hook exactly as they apply to any function. But JSX and TanStack introduce
complexity sources that Section 2's generic list doesn't make obvious — call them
out explicitly so they aren't missed.

### 5.1 JSX conditional rendering counts too
Each of these adds to the enclosing component/render function's CC exactly like
their non-JSX equivalents:
- `{condition && <Thing />}` → +1 per `&&`
- `{condition ? <A /> : <B />}` → +1 per `?`, and chained ternaries in JSX are
  *worse* for readability than in plain code because they're visually buried in markup
- Multiple early `if (loading) return <Spinner />` / `if (error) return <Error />`
  style guards → each +1, same as anywhere else

### 5.2 The "kitchen sink" component anti-pattern
**❌ Reject this:**
```tsx
function ProductList({ status, products, error, filters }: Props) {
  return (
    <div>
      {status === 'loading' ? (
        <Spinner />
      ) : status === 'error' ? (
        <ErrorBanner message={error} />
      ) : status === 'empty' ? (
        <EmptyState />
      ) : (
        <div>
          {filters.showPagination && products.length > 10 ? (
            <PaginatedGrid items={products} />
          ) : (
            <Grid items={products} />
          )}
        </div>
      )}
    </div>
  );
}
// Depth 4+ once nested, chained ternaries, CC easily >8
```

**✅ Require this instead — guard clauses first, then a status→renderer lookup:**
```tsx
const STATUS_RENDERERS: Record<Status, (p: Props) => JSX.Element> = {
  loading: () => <Spinner />,
  error: (p) => <ErrorBanner message={p.error} />,
  empty: () => <EmptyState />,
};

function ProductList(props: Props) {
  const renderer = STATUS_RENDERERS[props.status];
  if (renderer) return renderer(props);

  return props.filters.showPagination && props.products.length > 10
    ? <PaginatedGrid items={props.products} />
    : <Grid items={props.products} />;
}
// Flat, CC low, each status's rendering is independently readable and testable
```

### 5.3 TanStack Query — keep query logic out of components, and out of ad hoc arrays

**Query keys**: don't scatter `['products', filters]`-style arrays with inline
conditionals across multiple files — this is the same DRY violation as any other
duplicated logic (see `rentdue/feature/step2_scrutinize.md`), and it causes inconsistent
cache invalidation when two components build the "same" key slightly differently.
Centralize as a factory in a shared hooks/query-keys file:

```typescript
// frontend/src/shared/hooks/queries/productKeys.ts
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};
```

**`enabled` conditions**: a growing `enabled: !!id && !!user && status === 'ready' && hasPermission`
chain adds one CC point per `&&` to wherever it's inlined, and is unreadable at a
glance. Extract to a named, testable predicate:

```typescript
// ❌ inline in the component
useQuery({ queryKey: ..., enabled: !!id && !!user && status === 'ready' && hasPermission });

// ✅ named guard, single responsibility, testable in isolation
function isProductQueryReady(ctx: { id?: string; user?: User; status: string; hasPermission: boolean }): boolean {
  if (!ctx.id || !ctx.user) return false;
  if (ctx.status !== 'ready') return false;
  return ctx.hasPermission;
}
useQuery({ queryKey: productKeys.detail(id), enabled: isProductQueryReady({ id, user, status, hasPermission }) });
```

**`select` transforms**: a `select` function with branching logic is a shared
utility the moment it's used from more than one component — put it in the same
query-keys/hooks file, not inline in the `useQuery` call at the call site. If it's
one-off and simple, inline is fine; if it branches, it belongs in
`frontend/src/shared/hooks/queries/*.ts` per `rentdue/feature/step2_scrutinize.md`'s reuse rules.

### 5.4 TanStack Router loaders
Loader functions get the same limits as any other function. The common trap is
nested auth/redirect checks:

**❌ Reject:**
```typescript
loader: async ({ context }) => {
  if (context.user) {
    if (context.user.role === 'admin') {
      return fetchAdminData();
    } else {
      throw redirect({ to: '/unauthorized' });
    }
  } else {
    throw redirect({ to: '/login' });
  }
}
```

**✅ Guard clauses, flat:**
```typescript
loader: async ({ context }) => {
  if (!context.user) throw redirect({ to: '/login' });
  if (context.user.role !== 'admin') throw redirect({ to: '/unauthorized' });
  return fetchAdminData();
}
```

### 5.5 TanStack Table column definitions
Inline nested ternaries inside a `cell:` renderer buried in a columns array are
easy to miss during review because they don't look like "a function" at a glance —
they still count. Extract multi-branch cell renderers to named functions in the
same file or a shared `frontend/src/shared/components/table/renderers.ts`, following the same
Record-lookup pattern as 4.4 in Section 4 when the branching is keyed off a status
or type field.

### 5.6 Custom hooks and `useEffect`
Custom hooks (`useXyz`) are functions and get the same CC/depth/line limits. A
`useEffect` body with an if/else chain reacting to different dependency
combinations is usually a sign it should be split into multiple simpler effects,
each reacting to one thing — not flattened with more branches.

---

## 6. EXPRESS BACKEND — STACK-SPECIFIC PATTERNS

Repo mapping for this section: services = `backend/src/control-plane/*`, routes = `backend/src/dashboard-api/routes/*`, middleware = `backend/src/dashboard-api/middleware/*`, shared utils/validators = `backend/src/shared/*`. Frontend shared code lives in `frontend/src/shared/*`.

Section 4.6 covered the basic "thin handler, logic in a service" pattern. These
extend it for the complexity sources that show up specifically in Express apps.

### 6.1 Chain small single-purpose middlewares instead of one branching handler
**❌** One route handler doing auth + validation + rate-limit checks inline (each
`if` adds to that handler's CC). **✅** Compose middlewares, each individually
simple and independently testable:
```typescript
app.post('/orders', requireAuth, validateBody(createOrderSchema), rateLimit(), createOrderHandler);
```

### 6.2 Async error handling — one wrapper, not repeated try/catch
Repeating `try { ... } catch (err) { res.status(500)... }` in every handler
inflates CC per-handler and is itself a DRY violation per `rentdue/feature/step2_scrutinize.md`.
Centralize once:
```typescript
// backend/src/dashboard-api/middleware/asyncHandler.ts
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// route file
app.post('/orders', asyncHandler(createOrderHandler));
```

### 6.3 Centralized error mapping instead of per-route error branching
**❌** Each handler deciding status codes via its own if/else on error type.
**✅** Throw typed errors, map them once via a lookup at the bottom of the middleware
chain — same Record pattern as Section 4.1:
```typescript
// backend/src/shared/errors.ts
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

const ERROR_STATUS_MAP = new Map<Function, number>([
  [NotFoundError, 404],
  [ValidationError, 400],
]);

// backend/src/dashboard-api/middleware/errorHandler.ts (registered last)
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const status = ERROR_STATUS_MAP.get(err.constructor) ?? 500;
  res.status(status).json({ error: err.message });
}
```

### 6.4 Validation belongs in middleware, not hand-rolled if-chains
A handler with `if (!req.body.x) return res.status(400)...` repeated per field is
exactly the nested-guard-clause smell from Section 4.2, multiplied across every
route that needs validation. Use a schema (zod/joi) as its own middleware
(`validateBody(schema)`), collapsing what would be CC 5–10 of manual checks into a
single reused, once-tested piece.

### 6.5 Query/filter-building on request params
Building a DB query object from request query params with nested if-chains follows
the same fix as Section 4.1/4.4 — a filter-builder keyed by a Record lookup, not a
chain of conditionals per possible param.

### 6.6 Don't branch on HTTP method inside one handler
If a single function registered on multiple verbs internally does
`if (req.method === 'POST') {...} else if (req.method === 'PUT') {...}`, that's
working against Express's own routing. Register separate handlers per verb+route
instead — each stays independently simple.

---

## 7. REVIEWER ENFORCEMENT NOTE

Step 3 (Adversarial Reviewer) must compute or reasonably estimate CC, depth, and line count for every new/modified function — components, hooks, loaders, middleware, and route handlers alike — and reject on any single violation. When rejecting for complexity, the reviewer must cite which pattern from Section 4, 5, or 6 applies to the fix — never a vague "simplify this."

