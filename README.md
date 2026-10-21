# Repository Catalog Organizer

A small local-first app to scan a GitHub account or organization, review repository metadata, suggest categories and tags, and generate a Markdown project index.

## Features

- Scans personal-account or organization repositories using the GitHub REST API.
- Reads existing README files when requested.
- Suggests categories and tags with local heuristics; optionally uses an OpenAI API key configured on the local server.
- Lets you edit descriptions, categories, tags, and catalog inclusion.
- Exports a generated `README.md` and `catalog.json`.
- Does not push changes to GitHub or modify repository metadata.

## Requirements

- Python 3.9+
- Internet connection for GitHub API calls
- Optional: OpenAI API key for AI-assisted suggestions (usage may incur API charges)

No Python packages are required; the server uses the standard library.

## Run on Windows

1. Download and extract the ZIP.
2. Open PowerShell in the extracted `repo-catalog-organizer` folder.
3. Run:

   ```powershell
   python app.py
   ```

4. Open <http://127.0.0.1:8765> in your browser.
5. Enter a GitHub username or organization and select the owner type.

## Deploy on Render

Create a **Web Service** from this repository and choose **Python 3**. Use these commands:

- Build: `python -m compileall -q .`
- Start: `python app.py`

The app detects Render's `RENDER=true` environment variable and binds to `0.0.0.0`; Render supplies `PORT` automatically. No `HOST` setting is required. Add `OPENAI_API_KEY` only if you want AI-assisted suggestions; `OPENAI_MODEL` is optional. Keep the service access-restricted if you configure an OpenAI key or plan to enter private-repository tokens.

To enable AI suggestions, set your key in the same PowerShell session before launching:

```powershell
$env:OPENAI_API_KEY="your-api-key"
python app.py
```

Optional model override:

```powershell
$env:OPENAI_MODEL="gpt-4o-mini"
```

Do not paste an API key into public code or commit it to a repository. The app only reads `OPENAI_API_KEY` from the local server environment. Without it, the app uses heuristic suggestions and manual editing.

## Access and privacy

- Public repositories work without a GitHub token.
- For private repositories, enter a fine-grained GitHub token with the minimum read-only repository metadata and contents permissions needed. The app does not save the token; it stays in page memory until refresh/close.
- The local web server binds to `127.0.0.1` and is intended for use on your own computer.
- The app sends repository metadata and README excerpts to OpenAI only if an `OPENAI_API_KEY` is configured and you request analysis. Do not use AI analysis on private or sensitive repository content unless you are comfortable with the provider's data policies.
- The tool does not create commits, publish the README, or change GitHub descriptions/topics.

## Workflow

1. Scan an account or organization.
2. Select the repositories to include.
3. Click **Analyze README suggestions**.
4. Review and edit the proposed categories, descriptions, and tags.
5. Click **Generate README** and download or copy the Markdown.
6. Review the file and commit it to your `project-index` repository yourself.

## Limitations

- GitHub API rate limits apply.
- Missing README files are reported as analysis errors; repository metadata remains available.
- Classification is a suggestion. Verify the descriptions and tags before publishing.
- This is a local prototype, not a hosted multi-user service.
