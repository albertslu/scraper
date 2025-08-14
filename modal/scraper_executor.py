import json
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
import modal

# Create Modal app
app = modal.App("scraper-executor")

# Define the image with all required dependencies
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "wget", "gnupg", "ca-certificates", "fonts-liberation", "libasound2", "libatk-bridge2.0-0", "libdrm2", "libxcomposite1", "libxdamage1", "libxrandr2", "libgbm1", "libxss1", "libu2f-udev", "libvulkan1", "xvfb", "xauth")
    .run_commands(
        # Install Node.js 20
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        # Install global packages
        "npm install -g typescript ts-node",
        # Verify installations
        "node --version",
        "npm --version",
        "tsc --version",
        "ts-node --version"
    )
    .pip_install(
        "playwright==1.48.0",
        "httpx",
        "pydantic",
        "fastapi[standard]"
    )
    .run_commands(
        # Install Playwright browsers
        "playwright install chromium",
        "playwright install-deps chromium"
    )
)

@app.function(
    image=image,
    timeout=600,  # 10 minutes
    memory=2048,  # 2GB RAM
    cpu=2.0,      # 2 CPU cores
    secrets=[modal.Secret.from_name("scraper-secrets-v2")]
)
def execute_typescript_script(
    script_code: str,
    dependencies: List[str],
    tool_type: str,
    max_items: int = 1000,
    test_mode: bool = False,
    timeout_seconds: int = 300
) -> Dict[str, Any]:
    """
    Execute a TypeScript scraping script in a clean Node.js environment
    
    Args:
        script_code: The TypeScript code to execute
        dependencies: List of npm dependencies to install
        tool_type: Tool type (stagehand, playwright, etc.)
        max_items: Maximum items to scrape
        test_mode: Whether to run in test mode
        timeout_seconds: Execution timeout
    
    Returns:
        Execution result with data, errors, and metadata
    """
    
    print(f"🚀 Starting script execution (tool: {tool_type}, test_mode: {test_mode})")
    print(f"📦 Dependencies: {dependencies}")
    print(f"📊 Max items: {max_items}")
    
    start_time = time.time()
    
    try:
        # Create temporary directory for this execution
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            script_path = temp_path / "scraper.ts"
            package_json_path = temp_path / "package.json"
            
            # Create package.json with dependencies
            package_json = {
                "name": "modal-scraper",
                "version": "1.0.0",
                "dependencies": {
                    "typescript": "^5.0.0",
                    "ts-node": "^10.9.0",
                    "@types/node": "^20.0.0"
                },
                "devDependencies": {
                    "@types/node": "^20.0.0"
                }
            }
            
            # Add specific dependencies based on tool type and requested deps
            for dep in dependencies:
                if dep == "@browserbasehq/stagehand":
                    package_json["dependencies"]["@browserbasehq/stagehand"] = "^1.7.0"
                    # Ensure LLM provider SDKs are present so Stagehand can auto-create clients
                    # based on available env vars and selected model names
                    package_json["dependencies"]["@anthropic-ai/sdk"] = "^0.29.0"
                    package_json["dependencies"]["openai"] = "^4.56.0"
                    # Ensure playwright is available for browser installation/runtime
                    package_json["dependencies"]["playwright"] = "^1.48.2"
                elif dep == "playwright":
                    package_json["dependencies"]["playwright"] = "^1.48.2"
                elif dep == "zod":
                    package_json["dependencies"]["zod"] = "^3.23.8"
                elif dep == "uuid":
                    package_json["dependencies"]["uuid"] = "^10.0.0"
                    package_json["dependencies"]["@types/uuid"] = "^10.0.0"

            # Safety net: if tool_type indicates Stagehand, ensure core deps even if not explicitly listed
            if tool_type.lower().startswith("stagehand") or "@browserbasehq/stagehand" in str(dependencies):
                package_json["dependencies"].setdefault("@browserbasehq/stagehand", "^1.7.0")
                package_json["dependencies"].setdefault("zod", "^3.23.8")
                package_json["dependencies"].setdefault("@anthropic-ai/sdk", "^0.29.0")
                package_json["dependencies"].setdefault("openai", "^4.56.0")
                package_json["dependencies"].setdefault("playwright", "^1.48.2")

            # Safety net: if tool_type indicates Playwright, ensure playwright is present
            if tool_type.lower().startswith("playwright"):
                package_json["dependencies"].setdefault("playwright", "^1.48.2")
                # Include zod for schema usage in most scripts
                package_json["dependencies"].setdefault("zod", "^3.23.8")

            # Safety net: if tool_type indicates Hybrid, ensure both tool deps are present
            if tool_type.lower().startswith("hybrid"):
                package_json["dependencies"].setdefault("playwright", "^1.48.2")
                package_json["dependencies"].setdefault("@browserbasehq/stagehand", "^1.7.0")
                package_json["dependencies"].setdefault("zod", "^3.23.8")
                package_json["dependencies"].setdefault("@anthropic-ai/sdk", "^0.29.0")
                package_json["dependencies"].setdefault("openai", "^4.56.0")
            
            print(f"📝 Writing package.json: {package_json}")
            with open(package_json_path, 'w') as f:
                json.dump(package_json, f, indent=2)
            
            # Write TypeScript script (force headless mode for server environment)
            print(f"📝 Writing TypeScript script ({len(script_code)} chars)")
            
            # Force headless mode for all browser automation tools in server environment
            headless_script = script_code.replace(
                "headless: false",
                "headless: true"
            ).replace(
                "{ headless: false }",
                "{ headless: true }"
            )
            
            # Handle stealth and automation detection patterns
            if "playwright-stealth" in str(dependencies) or "stealth" in script_code.lower():
                print("🥷 Detected stealth mode - ensuring headless compatibility...")
                # Keep stealth args but force headless
                headless_script = headless_script.replace(
                    "headless: false",
                    "headless: true"
                ).replace(
                    "headless: true,\n    args: [",
                    "headless: true,\n    args: [\n      '--no-sandbox',\n      '--disable-setuid-sandbox',"
                )
            
            # Force headless mode for Stagehand specifically
            if "@browserbasehq/stagehand" in dependencies:
                # Just ensure environment variables are set properly
                print("🎭 Configuring Stagehand for headless server environment...")
                
                # Set DISPLAY for Stagehand (it needs this even in headless mode)
                headless_script = f"""
// Set display for Stagehand headless mode
process.env.DISPLAY = ':99';

{headless_script}
"""
                print("✅ Stagehand environment configured")

                # Do NOT inject a custom llmClient; let Stagehand auto-detect based on env + installed SDKs.
                # We already ensure provider SDKs are installed and API keys are forwarded.
            
            # Handle hybrid mode scripts that might use both tools
            if "hybrid" in tool_type.lower() or ("stagehand" in str(dependencies) and "playwright" in str(dependencies)):
                print("🔄 Detected hybrid mode - configuring for both Playwright and Stagehand...")
                # Ensure both tools run in headless mode
                headless_script = headless_script.replace(
                    "new Stagehand({",
                    "new Stagehand({ headless: true,"
                )
            
            print("🤖 Forcing headless mode for server environment")
            with open(script_path, 'w') as f:
                f.write(headless_script)
            
            # Install dependencies
            print("📦 Installing npm dependencies...")
            install_result = subprocess.run(
                ["npm", "install"],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=120  # 2 minutes for npm install
            )
            
            if install_result.returncode != 0:
                print(f"❌ npm install failed: {install_result.stderr}")
                return {
                    "success": False,
                    "data": [],
                    "totalFound": 0,
                    "errors": [f"Dependency installation failed: {install_result.stderr}"],
                    "executionTime": int((time.time() - start_time) * 1000),
                    "metadata": {
                        "toolUsed": tool_type,
                        "testMode": test_mode,
                        "phase": "dependency_installation"
                    }
                }
            
            print("✅ Dependencies installed successfully")
            
            # Install browsers for all packages that need them
            browser_packages = ["playwright", "@browserbasehq/stagehand", "puppeteer"]
            stealth_packages = ["playwright-stealth", "playwright-extra", "puppeteer-stealth", "puppeteer-extra"]
            
            # Determine if browser binaries are needed.
            # Consider both requested dependencies and tool_type for robustness.
            needs_browsers = (
                any(pkg in str(dependencies) for pkg in browser_packages)
                or tool_type.lower().startswith("stagehand")
                or tool_type.lower().startswith("playwright")
                or tool_type.lower().startswith("hybrid")
            )
            needs_stealth = any(pkg in str(dependencies) for pkg in stealth_packages)
            
            if needs_browsers:
                print("🎭 Installing browsers for all automation tools...")
                
                # Install common stealth/anti-detection packages if any browser automation is used
                if needs_browsers and not needs_stealth:
                    print("🥷 Installing common stealth packages for anti-detection...")
                    stealth_install = subprocess.run(
                        ["npm", "install", "playwright-stealth", "playwright-extra", "playwright-extra-plugin-stealth", "puppeteer-stealth", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    if stealth_install.returncode == 0:
                        print("✅ Stealth packages installed")
                    else:
                        print(f"⚠️ Stealth package install warning (continuing): {stealth_install.stderr}")
                
                # Install Playwright browsers (covers both playwright and stagehand)
                browser_install_result = subprocess.run(
                    ["npx", "playwright", "install", "chromium", "--with-deps"],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minutes for browser download + system deps
                )
                
                if browser_install_result.returncode != 0:
                    print(f"⚠️ Browser install warning: {browser_install_result.stderr}")
                    # Try without system deps
                    print("🔄 Retrying without system dependencies...")
                    retry_result = subprocess.run(
                        ["npx", "playwright", "install", "chromium"],
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        timeout=180
                    )
                    print(f"🔄 Retry result: {retry_result.returncode}")
                
                print("✅ Browsers and stealth tools ready for all automation packages")
            
            # Create simple tsconfig.json for ts-node execution (like original execution module)
            tsconfig = {
                "compilerOptions": {
                    "target": "ES2020",
                    "module": "CommonJS",
                    "moduleResolution": "node",
                    "allowSyntheticDefaultImports": True,
                    "esModuleInterop": True,
                    "strict": False,
                    "skipLibCheck": True,
                    "lib": ["ES2020", "DOM", "DOM.Iterable"]
                },
                "ts-node": {
                    "transpileOnly": True
                }
            }
            
            tsconfig_path = temp_path / "tsconfig.json"
            with open(tsconfig_path, 'w') as f:
                json.dump(tsconfig, f, indent=2)
            
            # Execute TypeScript script with ts-node
            print("⚡ Executing TypeScript script...")
            
            # Set environment variables
            env = os.environ.copy()
            env["NODE_PATH"] = str(temp_path / "node_modules")
            env["MAX_ITEMS"] = str(max_items)
            env["TEST_MODE"] = str(test_mode).lower()
            # Ensure DISPLAY exists for any browser automation
            if "DISPLAY" not in env:
                env["DISPLAY"] = ":99"
            
            # Set up LLM API keys for Stagehand and other tools
            # Set up API keys from Modal environment variables
            # These should be set as Modal secrets for security
            
            # Try to load API keys from Modal environment variables
            required_env_vars = [
                "ANTHROPIC_API_KEY", 
                "BROWSERBASE_API_KEY",
                "BROWSERBASE_PROJECT_ID",
                "NEXT_PUBLIC_SUPABASE_URL",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY", 
                "SUPABASE_SERVICE_ROLE_KEY",
                "OPENAI_API_KEY",  # Optional
                "OPENAI_MODEL",     # Optional
                "ANTHROPIC_MODEL"   # Optional
            ]
            
            for var in required_env_vars:
                if var in os.environ:
                    env[var] = os.environ[var]
                    print(f"✅ Added {var} from Modal environment")
                else:
                    print(f"⚠️ {var} not found in Modal environment")
            
            # Validate that at least one LLM key is present (Stagehand requires this)
            has_openai = bool(env.get("OPENAI_API_KEY"))
            has_anthropic = bool(env.get("ANTHROPIC_API_KEY"))
            if not (has_openai or has_anthropic):
                missing_hint = "Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY found in Modal secret/environment."
                print(f"❌ LLM configuration missing. {missing_hint}")
                return {
                    "success": False,
                    "data": [],
                    "totalFound": 0,
                    "errors": [
                        "No LLM API key configured for Stagehand.",
                        missing_hint,
                        "Add one of these to the Modal secret 'scraper-secrets-v2': OPENAI_API_KEY or ANTHROPIC_API_KEY."
                    ],
                    "executionTime": int((time.time() - start_time) * 1000),
                    "metadata": {
                        "toolUsed": tool_type,
                        "testMode": test_mode,
                        "phase": "environment_validation"
                    }
                }

            print(f"🔑 API keys configured for Stagehand")
            
            # Use xvfb-run to provide a virtual display for browser automation
            if (
                "@browserbasehq/stagehand" in dependencies
                or tool_type.lower().startswith("stagehand")
                or tool_type.lower().startswith("playwright")
                or tool_type.lower().startswith("hybrid")
            ):
                print("🎭 Running with virtual display (xvfb-run)")
                exec_command = ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24", "npx", "ts-node", "scraper.ts"]
            else:
                exec_command = ["npx", "ts-node", "scraper.ts"]
            
            exec_result = subprocess.run(
                exec_command,
                cwd=temp_dir,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                env=env
            )
            
            execution_time = int((time.time() - start_time) * 1000)
            
            print(f"⏱️ Execution completed in {execution_time}ms")
            print(f"📤 Return code: {exec_result.returncode}")
            
            if exec_result.stdout:
                print(f"📤 STDOUT ({len(exec_result.stdout)} chars):")
                print(exec_result.stdout[:1000] + "..." if len(exec_result.stdout) > 1000 else exec_result.stdout)
            
            if exec_result.stderr:
                print(f"⚠️ STDERR ({len(exec_result.stderr)} chars):")
                print(exec_result.stderr[:1000] + "..." if len(exec_result.stderr) > 1000 else exec_result.stderr)
            
            # Parse execution results
            if exec_result.returncode == 0:
                # Try to parse structured output from stdout
                result_data = parse_execution_output(exec_result.stdout)
                
                if result_data:
                    return {
                        "success": True,
                        "data": result_data.get("data", []),
                        "totalFound": len(result_data.get("data", [])),
                        "errors": [],
                        "executionTime": execution_time,
                        "metadata": {
                            "toolUsed": tool_type,
                            "testMode": test_mode,
                            "originalCount": result_data.get("totalFound", 0),
                            "limited": len(result_data.get("data", [])) >= max_items
                        }
                    }
                else:
                    # No structured output found but script succeeded
                    return {
                        "success": True,
                        "data": [],
                        "totalFound": 0,
                        "errors": ["Script executed successfully but no structured output found"],
                        "executionTime": execution_time,
                        "metadata": {
                            "toolUsed": tool_type,
                            "testMode": test_mode,
                            "stdout": exec_result.stdout[:500] if exec_result.stdout else ""
                        }
                    }
            else:
                # Script failed
                return {
                    "success": False,
                    "data": [],
                    "totalFound": 0,
                    "errors": [f"Script execution failed: {exec_result.stderr}"],
                    "executionTime": execution_time,
                    "metadata": {
                        "toolUsed": tool_type,
                        "testMode": test_mode,
                        "returnCode": exec_result.returncode,
                        "stderr": exec_result.stderr[:500] if exec_result.stderr else "",
                        "stdout": exec_result.stdout[:500] if exec_result.stdout else ""
                    }
                }
            
    except subprocess.TimeoutExpired:
        execution_time = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "data": [],
            "totalFound": 0,
            "errors": [f"Script execution timed out after {timeout_seconds} seconds"],
            "executionTime": execution_time,
            "metadata": {
                "toolUsed": tool_type,
                "testMode": test_mode,
                "timeout": True
            }
        }
    
    except Exception as e:
        execution_time = int((time.time() - start_time) * 1000)
        print(f"💥 Unexpected error: {str(e)}")
        return {
            "success": False,
            "data": [],
            "totalFound": 0,
            "errors": [f"Unexpected error: {str(e)}"],
            "executionTime": execution_time,
            "metadata": {
                "toolUsed": tool_type,
                "testMode": test_mode,
                "error": str(e)
            }
        }


def parse_execution_output(stdout: str) -> Optional[Dict[str, Any]]:
    """
    Parse structured output from script execution
    Looks for JSON results between markers
    """
    try:
        # Look for execution results markers
        start_marker = "=== EXECUTION_RESULTS_START ==="
        end_marker = "=== EXECUTION_RESULTS_END ==="
        
        start_idx = stdout.find(start_marker)
        end_idx = stdout.find(end_marker)
        
        if start_idx != -1 and end_idx != -1:
            json_str = stdout[start_idx + len(start_marker):end_idx].strip()
            return json.loads(json_str)
        
        # Fallback: look for any JSON-like structure
        lines = stdout.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                try:
                    return json.loads(line)
                except:
                    continue
        
        return None
        
    except Exception as e:
        print(f"⚠️ Failed to parse execution output: {e}")
        return None


# Add missing import
import time


@app.function(
    image=image,
    timeout=600,  # 10 minutes
    memory=2048,  # 2GB RAM
    cpu=2.0,      # 2 CPU cores
)
@modal.fastapi_endpoint(method="POST")
def execute_webhook(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Web endpoint for executing TypeScript scripts via HTTP
    """
    try:
        print("🌐 Received webhook request for script execution")
        
        # Extract parameters from request
        script_code = request_data.get("script_code", "")
        dependencies = request_data.get("dependencies", [])
        tool_type = request_data.get("tool_type", "unknown")
        max_items = request_data.get("max_items", 1000)
        test_mode = request_data.get("test_mode", False)
        timeout_seconds = request_data.get("timeout_seconds", 300)
        
        if not script_code:
            return {
                "success": False,
                "data": [],
                "totalFound": 0,
                "errors": ["No script code provided"],
                "executionTime": 0,
                "metadata": {
                    "toolUsed": tool_type,
                    "testMode": test_mode,
                    "error": "Missing script code"
                }
            }
        
        # Execute the script
        result = execute_typescript_script.remote(
            script_code=script_code,
            dependencies=dependencies,
            tool_type=tool_type,
            max_items=max_items,
            test_mode=test_mode,
            timeout_seconds=timeout_seconds
        )
        
        print(f"✅ Webhook execution completed: {result['success']}")
        return result
        
    except Exception as e:
        print(f"💥 Webhook error: {str(e)}")
        return {
            "success": False,
            "data": [],
            "totalFound": 0,
            "errors": [f"Webhook error: {str(e)}"],
            "executionTime": 0,
            "metadata": {
                "toolUsed": request_data.get("tool_type", "unknown"),
                "testMode": request_data.get("test_mode", False),
                "webhookError": str(e)
            }
        }


@app.local_entrypoint()
def test_execution():
    """Test the execution function locally"""
    
    # Simple test script
    test_script = '''
console.log('🧪 Test script starting...');

async function main() {
    console.log('✅ TypeScript execution working!');
    
    const result = [
        { name: 'Test Company 1', industry: 'Tech' },
        { name: 'Test Company 2', industry: 'Finance' }
    ];
    
    console.log('=== EXECUTION_RESULTS_START ===');
    console.log(JSON.stringify({
        success: true,
        data: result,
        totalFound: result.length
    }, null, 2));
    console.log('=== EXECUTION_RESULTS_END ===');
    
    return result;
}

main().catch(console.error);
'''
    
    print("🧪 Testing Modal execution function...")
    
    result = execute_typescript_script.remote(
        script_code=test_script,
        dependencies=["zod"],
        tool_type="test",
        max_items=10,
        test_mode=True
    )
    
    print("📊 Test Result:")
    print(json.dumps(result, indent=2))
    
    return result 