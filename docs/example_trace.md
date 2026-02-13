# Example Trace: Mapping fire.log to DOT Annotations

Let's trace a real execution sequence from the fire.log and map it through YAML/DOT.

## From fire.log (lines 1-10):
```
[1] (1) c2 2
[1] (3) copy 58 58
[2] (0) c0 0
[2] (5) carry INIT->BLOCK 0
[2] (19) c1_1 1
[2] (11) pconst_arg4 4
[2] (2) c1 1
[2] (7) carry_2 INIT->BLOCK 1
[2] (1) c2 2
[2] (6) carry_1 INIT->BLOCK 2
```

## From YAML (dmv.c.yaml):

**Instruction ID 0 (c0 - constant):**
```yaml
- id: 0
  name: c0
  op: dataflow.constant
  type: i64
  inputs: [3]
  outputs:
    - consumer_id: 5
      oport: 0
      iport: 1
    - consumer_id: 4
      oport: 0
      iport: 0
    - consumer_id: 57
      oport: 0
      iport: 1
  value: 0
```

**Instruction ID 3 (copy):**
```yaml
- id: 3
  name: copy
  op: dataflow.copy
  type: '!dataflow.instruction_pointer'
  outputs:
    - consumer_id: 19
      oport: 0
      iport: 0
    - consumer_id: 11
      oport: 0
      iport: 0
    - consumer_id: 2
      oport: 0
      iport: 0
    - consumer_id: 1
      oport: 0
      iport: 0
    - consumer_id: 0
      oport: 0
      iport: 0
    - consumer_id: 57
      oport: 0
      iport: 0
  attributes:
    function_input: 'true'
```

**Instruction ID 5 (carry):**
```yaml
- id: 5
  name: carry
  op: riptide.carry
  predicate: 'true'
  inputs: [14, 0, 11, 7]
  outputs:
    - consumer_id: 8
      oport: 0
      iport: 0
    - consumer_id: 11
      oport: 1
      iport: 1
    - consumer_id: 37
      oport: 0
      iport: 1
```

---

## Trace Analysis:

### Fire.log Entry: `[1] (3) copy 58 58`
- **Cycle:** 1
- **Instruction:** 3 (copy)
- **Logged values:** 58 58
- **Mapping:** 
  - 1st value (58) → `res[0]` (output)
  - 2nd value (58) → duplicate (echo back)
  
**Interpretation:** Copy took input 58 (instruction pointer) and produced output 58.

**YAML Verification:** 
```yaml
id: 3
op: dataflow.copy
# input comes from block argument (function_input)
outputs:
  - consumer_id: 19
    oport: 0      # ← This is res[0]
    iport: 0
  - consumer_id: 11
    oport: 0      # ← This is res[0]
    iport: 0
  # ... (res[0] goes to multiple consumers)
```

**DOT Graph Translation:**
```dot
graph_arg_0 → dataflow_copy_3 [color="#E91E63", label="res[0]→op[0]"]
dataflow_copy_3 → instruction_19 [color="#E91E63", label="res[0]→op[0]"]
dataflow_copy_3 → instruction_11 [color="#E91E63", label="res[0]→op[0]"]
```

---

### Fire.log Entry: `[2] (0) c0 0`
- **Cycle:** 2
- **Instruction:** 0 (c0 - constant)
- **Logged value:** 0
- **Mapping:** 
  - 1st value (0) → `res[0]`

**Interpretation:** Constant instruction produced value 0.

**YAML Verification:**
```yaml
id: 0
op: dataflow.constant
inputs: [3]      # Takes function_input from instruction 3
outputs:
  - consumer_id: 5
    oport: 0     # ← This is res[0]
    iport: 1     # Instruction 5's second input
```

**DOT Graph Translation:**
```dot
dataflow_copy_3 → dataflow_constant_0 [color="#2874A6", label="res[0]→op[0]"]
dataflow_constant_0 → riptide_carry_5 [color="#2874A6", label="res[0]→op[1]"]
```

---

### Fire.log Entry: `[2] (5) carry INIT->BLOCK 0`
- **Cycle:** 2
- **Instruction:** 5 (carry - RipTide carry)
- **Logged values:** "INIT->BLOCK" 0
- **Mapping:**
  - "INIT->BLOCK" → State transition marker
  - 0 → `res[0]` (data output)

**Interpretation:** Carry transitioned from INIT to BLOCK state and output data value 0.

**YAML Verification:**
```yaml
id: 5
op: riptide.carry
predicate: 'true'
inputs: [14, 0, 11, 7]
  # op[0]=14 (condition from instr 14)
  # op[1]=0 (data1 from instr 0)  ← This is what gets logged in INIT->BLOCK!
  # op[2]=11 (data2 from instr 11)
  # op[3]=7 (state from instr 7)
outputs:
  - consumer_id: 8
    oport: 0     # ← This is res[0]
    iport: 0
  - consumer_id: 11
    oport: 1     # ← This is res[1] (next state)
    iport: 1
```

**DOT Graph Translation:**
```dot
instruction_14 → riptide_carry_5 [color="#E74C3C", penwidth=1, label="res[0]→op[0]"]
dataflow_constant_0 → riptide_carry_5 [color="#2874A6", penwidth=2, label="res[0]→op[1]"]
instruction_11 → riptide_carry_5 [color="#2874A6", penwidth=2, label="res[0]→op[2]"]
instruction_7 → riptide_carry_5 [color="#2874A6", penwidth=2, label="res[0]→op[3]"]
riptide_carry_5 → instruction_8 [color="#2874A6", penwidth=2, label="res[0]→op[0]"]
riptide_carry_5 → instruction_11 [color="#2874A6", penwidth=2, label="res[1]→op[1]"]
```

**Control Flow Notes:**
- Thin red line (penwidth=1) from instr 14 = control flow edge (boolean)
- Thick blue lines (penwidth=2) = data edges
- The "INIT->BLOCK" state is implicit - not shown in DOT but marked as control flow instruction (cfin=true)

---

## Key Insights from This Trace

1. **Constants** log only output: `[2] (0) c0 0` → `res[0]=0`

2. **Copy/Passthrough** log output (echoed back): `[1] (3) copy 58 58` → `res[0]=58`

3. **Carry** logs special format:
   - "INIT->BLOCK" indicates state + `res[0]` = first data input (`op[1]`)
   - The actual value logged (0) is `res[0]` (first output)
   - `res[1]` (state) is implicit/unmarked

4. **Multiple consumers** of same output:
   - Instruction 0's `res[0]` (value 0) goes to instruction 5's `op[1]` 
   - Also goes to instruction 4's `op[0]` 
   - Also goes to instruction 57's `op[1]`
   - All represented as separate OutputConnection entries in YAML

5. **DOT Edge Labels:**
   - Label format: `res[output_idx]→op[input_idx]`
   - Example: `res[0]→op[1]` means "output port 0 of producer → input port 1 of consumer"
   - Edge colors/widths indicate data type (control vs data)

---

## How to Trace Your Own Entries

For any fire.log entry `[cycle] (id) name args...`:

1. Look up `id` in YAML
2. Find the instruction's `inputs` array (tells you what op[n] are expected)
3. Find the instruction's `outputs` array (tells you what res[n] are produced)
4. Match logged `args` to YAML inputs/outputs based on instruction type
5. In DOT graph, edges will be labeled `res[n]→op[m]` showing the connection

Example for **storeIndex** at line: `[78] (53) storeIndex 168 3 192 7310`

From YAML: `inputs: [base, offset, data, order]` = `[op[0], op[1], op[2], op[3]]`

Log format for storeIndex: `base offset addr data` = `op[0] op[1] (computed) op[2]`

So: `168` is `op[0]`, `3` is `op[1]`, `7310` is `op[2]`

The edges would be:
```dot
producer_base → storeindex_53 [label="res[0]→op[0]"]
producer_offset → storeindex_53 [label="res[0]→op[1]"]
producer_data → storeindex_53 [label="res[0]→op[2]"]
```

