## Default Permission

Register this install for push notifications: prompt for permission, read the
device token (APNs on iOS, FCM on Android), report which APNs environment the
token belongs to, and say which platform it came from so the server knows which
provider to send through. All four run once per launch from the registration
hook, and the prompt itself is shown by the OS, which only ever asks the user
once per install.

#### This default permission set includes the following:

- `allow-request-permission`
- `allow-get-token`
- `allow-environment`
- `allow-platform`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`push:allow-environment`

</td>
<td>

Enables the environment command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-environment`

</td>
<td>

Denies the environment command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:allow-get-token`

</td>
<td>

Enables the get_token command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-get-token`

</td>
<td>

Denies the get_token command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:allow-platform`

</td>
<td>

Enables the platform command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-platform`

</td>
<td>

Denies the platform command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:allow-request-permission`

</td>
<td>

Enables the request_permission command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`push:deny-request-permission`

</td>
<td>

Denies the request_permission command without any pre-configured scope.

</td>
</tr>
</table>
