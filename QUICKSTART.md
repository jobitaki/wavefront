# Quick Start Guide - Tidepool

## Running Tidepool

1. **Open the application**:
   Simply open `index.html` in any modern web browser (Chrome, Firefox, Safari, Edge)

2. **Load your DOT file**:
   - Click the "DOT File" button
   - Select your `.dot` or `.gv` file
   - The graph will render automatically

3. **Load your fire log**:
   - Click the "Fire Log" button
   - Select your fire log file (`.log` or `.txt`)
   - The execution log will populate in the right panel

4. **Control playback**:
   - **▶ Play**: Automatically step through execution
   - **⏸ Pause**: Pause automatic playback
   - **⏮ Reset**: Return to the beginning
   - **⏭ Step**: Manually advance one step
   - **Speed slider**: Adjust playback speed (1x-10x)

## Try the Examples

1. Load `examples/sample.dot`
2. Load `examples/sample.fire.log`
3. Click Play or Step to see the visualization

## File Format Requirements

### DOT File
- Standard Graphviz DOT format
- Node IDs must match instruction IDs in fire.log
- Example:
  ```dot
  digraph dataflow {
      LOAD_A [label="LOAD A"];
      ADD [label="ADD"];
      LOAD_A -> ADD [label="data"];
  }
  ```

### Fire Log File
- Format: `<cycle> <instruction_id> <output1> <output2> ...`
- One execution per line
- Instruction IDs must match node IDs in DOT file
- Example:
  ```
  1 LOAD_A 42
  3 ADD 52
  ```

## Visualization

- **Orange node**: Currently executing instruction
- **Yellow/animated edges**: Token flow from executed instruction
- **Blue highlight**: Active log entry
- **Status bar**: Shows current step and execution details

## Tips

- Use the Step button to examine execution one step at a time
- Adjust speed for faster or slower playback
- Scroll through the execution log to see all steps
- Reset to replay the execution from the beginning

## Troubleshooting

**Graph doesn't render?**
- Check that your DOT file has valid syntax
- Ensure nodes are properly defined

**Nodes don't highlight?**
- Verify that instruction IDs in fire.log exactly match node IDs in DOT file
- IDs are case-sensitive

**No edges highlight?**
- Make sure edges are defined in the DOT file
- Edge visualization shows outgoing edges from the executing instruction
