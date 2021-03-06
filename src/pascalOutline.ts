'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import fs = require('fs');

export function parseGlobalSymbols(output: string): vscode.SymbolInformation[] {

	var items: vscode.SymbolInformation[] = new Array<vscode.SymbolInformation>();
	output.split(/\r?\n/)
		.forEach(function (value, index, array) {

			if (value != null && value != "") {

				let values = value.split(/ +/);

				let className: string = '';
				let methodName: string = '';
				let tag = values.shift();
				let line = parseInt(values.shift()) - 1;
				let filePath = values.shift();
				let kindStr = values.shift();
				let kind: vscode.SymbolKind;

				if (tag.indexOf('.') > 0) {
					className = tag.substr(1, tag.indexOf('.') - 1)
					methodName = tag.substring(tag.indexOf('.') + 1);
				} else {
					methodName = tag;
					kind = vscode.SymbolKind.Interface;
				}
				if ((kindStr == 'constructor') || (kindStr == 'destructor')) {
					kind = vscode.SymbolKind.Constructor;
				} else {
					kind = kind || vscode.SymbolKind.Method;
				}
				let rest = values.join(' ');

				let symbolInfo = new vscode.SymbolInformation(
					methodName, kind, new vscode.Range(line, 0, line, 0), undefined, className
				);

				items.push(symbolInfo);
			}

		});

	return items;
}

export function documentSymbols(filename: string): Promise<vscode.SymbolInformation[]> {
	return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {

		// generate
		let listTXT = path.join(vscode.workspace.rootPath, 'GLIST');
        fs.writeFileSync(listTXT, filename);
		cp.execFile('gtags', ['--accept-dotfiles', '-f', listTXT], { cwd: vscode.workspace.rootPath }, (err, stdout, stderr) => {

			if (err) {
				console.log('The "gtags" command is not available. Make sure GLOBAL and CTAGS are on PATH');
				reject('Error running gtags: ' + err);
			}

			try {
				// discover
				let p = cp.execFile('global', ['-f', filename], { cwd: vscode.workspace.rootPath }, (err, stdout, stderr) => {
					try {
						if (err && (<any>err).code === 'ENOENT') {
							console.log('The "global" command is not available. Make sure it is on PATH');
						}
						if (err) return resolve(null);
						let result = stdout.toString();
						//console.log(result);
						let decls = <vscode.SymbolInformation[]>parseGlobalSymbols(result);
						return resolve(decls);
					} catch (e) {
						reject(e);
					}
				});
			} catch (e) {
				reject(e);
			}
		});


	});
}

export class PascalDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		
		let fileName: string;
		if (document.isDirty) {
			let range: vscode.Range = new vscode.Range(
                0, 0,
                document.lineCount,
                document.lineAt(document.lineCount - 1).range.end.character
            );

            let textToFormat = document.getText(range);
            let tempFile: string = path.join(vscode.workspace.rootPath, '.vscode/GTEMP.pas');
			
			if (!fs.existsSync(path.join(vscode.workspace.rootPath, '.vscode'))) {
				fs.mkdirSync(path.join(vscode.workspace.rootPath, '.vscode'));
			}

            fs.writeFileSync(tempFile, textToFormat);
			fileName = tempFile;
		} else {
			fileName = document.fileName;
		}		

		return documentSymbols(fileName).then(decls => {
			return decls;
		});
	}
}
