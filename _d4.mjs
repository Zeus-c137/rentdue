import fs from "fs";

const FILE = "src/components/DepositView.tsx";
let src = fs.readFileSync(FILE, "utf8");
const toCRLF = (s) => s.replace(/\n/g, "\r\n");

const before = toCRLF(`                  Submit
                </Button>
              </form>
            )}
      ) : paymentStatus === "PENDING" ? (`);

const after = toCRLF(`                  Submit
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : paymentStatus === "PENDING" ? (`);

const count = src.split(before).length - 1;
if (count !== 1) {
  console.error(`FAIL: expected 1 match, got ${count}`);
  process.exit(1);
}
src = src.replace(before, after);
fs.writeFileSync(FILE, src);
console.log("OK: IDLE wrapper closed");